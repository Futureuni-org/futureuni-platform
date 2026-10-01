import "server-only";

/**
 * Qualification (phase-11 Step 2). `qualifyLead` scores an AUDITED (or re-scores a pre-contact) lead,
 * decides its outcome — qualify, disqualify, compliance hold, capacity hold or borderline review —
 * applies the lead transition, writes the score history and the brief, and emits `lead.scored`. A
 * score change never moves a lead backwards once it is CONTACTED.
 */

import type { Actor, Clock, LeadStatus, ScoreBand } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { db, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { getContactability } from "@/modules/acquisition/compliance";
import { canTransition, transitionLead } from "@/modules/acquisition/core";

import { buildScoringFacts } from "./facts";
import { scoreLead, type ScoreResult } from "./engine";
import { decideOutcome } from "./outcome";
import { generateBrief } from "./brief";
import { runBorderlineReview } from "./review";
import { getOutreachThrottle } from "./throttle";
import {
  assignLeadOwner,
  getLead,
  loadScoringInputs,
  recordScoreChange,
  saveScore,
  userHasServiceLine,
} from "./scoring.repo";
import type { ScoringInputs } from "./scoring.repo";
import type { BorderlineReviewInput } from "./tasks";

export interface QualifyResult {
  leadId: string;
  status: LeadStatus;
  score: number;
  band: ScoreBand;
  previousScore: number | null;
}

function buildReviewInput(inputs: ScoringInputs, score: ScoreResult, disqualifiers: BorderlineReviewInput["disqualifiers"]): BorderlineReviewInput {
  const nonDismissed = inputs.findings.filter((f) => f.dismissedAt === null);
  return {
    companyName: inputs.company.name,
    serviceLine: inputs.lead.serviceLine,
    market: inputs.lead.market,
    score: score.score,
    band: score.band,
    scoreReasons: score.reasons.map((r) => ({ ruleId: r.ruleId, label: r.label, points: r.points })),
    signals: inputs.signals.map((s) => ({ id: s.id, signalType: s.signalType })),
    findings: nonDismissed.map((f) => ({
      id: f.id,
      checkId: f.checkId,
      claim: f.claim,
      severity: f.severity,
      pitchable: f.pitchable,
    })),
    disqualifiers,
  };
}

/**
 * Scores (or re-scores) a lead and applies the outcome. `actor` is the user or the SYSTEM job that
 * triggered it. Idempotent transitions: re-entering the same status writes no status event, and a
 * CONTACTED lead only gets its score refreshed, never a status change.
 */
export async function qualifyLead(
  leadId: string,
  ctx: { actor: Actor; jobRunId?: string; clock?: Clock },
): Promise<QualifyResult> {
  const clock = ctx.clock ?? { now: () => new Date() };
  const now = clock.now();

  const inputs = await loadScoringInputs(db, leadId);
  if (inputs === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  const { lead, company } = inputs;
  const previousScore = lead.score;

  const contactability = await getContactability(null, {
    companyId: company.id,
    ...(lead.primaryContactId === null ? {} : { contactId: lead.primaryContactId }),
  });

  const { getActiveProfile } = await import("@/modules/acquisition/profiles");
  const profile = await getActiveProfile(lead.serviceLine);

  const facts = buildScoringFacts({
    lead: { market: lead.market, country: lead.country },
    company,
    primaryContact: inputs.primaryContact,
    signals: inputs.signals,
    findings: inputs.findings,
    contactability,
  });
  const score = scoreLead({ facts, scoring: profile.scoring });

  // A contacted lead only gets its score refreshed — never moved backwards (module spec §3.8).
  if (lead.firstContactedAt !== null) {
    await withTransaction(async (tx) => {
      await saveScore(tx, leadId, { score: score.score, band: score.band, reasons: score.reasons, needsHumanReview: lead.needsHumanReview, now });
      await recordScoreChange(tx, { leadId, actor: ctx.actor, previousScore, score: score.score, band: score.band, reasons: score.reasons });
      await publishLeadScored(tx, { leadId, score: score.score, band: score.band, previousScore, needsHumanReview: lead.needsHumanReview, actor: ctx.actor });
    });
    return { leadId, status: lead.status, score: score.score, band: score.band, previousScore };
  }

  // Only AUDITED (first scoring), SCORED (re-score) and NURTURE (capacity/compliance release) are
  // scored pre-contact. Leads mid-review (IN_REVIEW/APPROVED) or before audit are left untouched.
  if (lead.status !== "AUDITED" && lead.status !== "SCORED" && lead.status !== "NURTURE") {
    return {
      leadId,
      status: lead.status,
      score: previousScore ?? score.score,
      band: lead.scoreBand ?? score.band,
      previousScore,
    };
  }

  const throttle = await getOutreachThrottle(lead.serviceLine);
  const outcome = decideOutcome(score, {
    facts,
    disqualifiers: profile.disqualifiers,
    lowScoreAction: profile.scoring.lowScoreAction,
    throttleMode: throttle.mode,
  });

  const needsHumanReview = outcome.status === "SCORED" && score.band === "BORDERLINE";

  // Borderline review (external AI) runs before the transaction; it assists, never auto-disqualifies.
  if (needsHumanReview) {
    try {
      await runBorderlineReview(buildReviewInput(inputs, score, profile.disqualifiers), {
        actor: ctx.actor,
        leadId,
        companyId: company.id,
      });
    } catch {
      // A failed review never blocks scoring; the lead still lands in SCORED for a human.
    }
  }

  const finalStatus = await withTransaction(async (tx) => {
    await saveScore(tx, leadId, { score: score.score, band: score.band, reasons: score.reasons, needsHumanReview, now });
    await recordScoreChange(tx, { leadId, actor: ctx.actor, previousScore, score: score.score, band: score.band, reasons: score.reasons });

    let status = lead.status;
    if (outcome.status !== lead.status && canTransition(lead.status, outcome.status, lead)) {
      const { lead: updated, event } = await transitionLead(tx, {
        leadId,
        to: outcome.status,
        actor: ctx.actor,
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        ...(outcome.nurtureReason === undefined ? {} : { nurtureReason: outcome.nurtureReason }),
        clock,
      });
      status = updated.status;
      if (event !== null) {
        await publishAfterCommit(tx, {
          name: "lead.statusChanged",
          actor: ctx.actor,
          payload: {
            leadId,
            leadEventId: event.id,
            from: event.fromStatus,
            to: outcome.status,
            serviceLine: lead.serviceLine,
            market: lead.market,
            ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
          },
        });
      }
    }

    await publishLeadScored(tx, { leadId, score: score.score, band: score.band, previousScore, needsHumanReview, actor: ctx.actor });
    return status;
  });

  // Write the brief for scored leads (external AI; failure doesn't undo scoring — it regenerates later).
  if (finalStatus === "SCORED") {
    try {
      await generateBrief(leadId, { actor: ctx.actor, clock });
    } catch {
      /* brief regenerates on the next finding change or nightly re-score */
    }
  }

  return { leadId, status: finalStatus, score: score.score, band: score.band, previousScore };
}

async function publishLeadScored(
  tx: Tx,
  input: { leadId: string; score: number; band: ScoreBand; previousScore: number | null; needsHumanReview: boolean; actor: Actor },
): Promise<void> {
  await publishAfterCommit(tx, {
    name: "lead.scored",
    actor: input.actor,
    payload: {
      leadId: input.leadId,
      score: input.score,
      band: input.band,
      previousScore: input.previousScore,
      needsHumanReview: input.needsHumanReview,
    },
  });
}

/** Manual disqualification (US-41). Fails with INVALID_TRANSITION from a contacted status (use Lost). */
export async function disqualifyLead(
  actor: Actor,
  leadId: string,
  reason: string,
  opts: { clock?: Clock } = {},
): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new AppError("VALIDATION_FAILED", "Disqualifying a lead needs a reason.");
  const lead = await getLead(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.disqualify", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });
  const clock = opts.clock ?? { now: () => new Date() };

  await withTransaction(async (tx) => {
    const { event } = await transitionLead(tx, { leadId, to: "DISQUALIFIED", actor, reason: trimmed, clock });
    if (event !== null) {
      await publishAfterCommit(tx, {
        name: "lead.statusChanged",
        actor,
        payload: {
          leadId,
          leadEventId: event.id,
          from: event.fromStatus,
          to: "DISQUALIFIED",
          serviceLine: lead.serviceLine,
          market: lead.market,
          reason: trimmed,
        },
      });
    }
    await audit.record(tx, {
      actor,
      action: "acquisition.lead.disqualify",
      targetType: "acquisition.lead",
      targetId: leadId,
      after: { reason: trimmed },
    });
  });
}

/** Reassigns a lead to a teammate on the lead's line (US-41). */
export async function assignLead(
  actor: Actor,
  leadId: string,
  ownerId: string,
): Promise<void> {
  const lead = await getLead(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.assign", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });
  if (!(await userHasServiceLine(ownerId, lead.serviceLine))) {
    throw new AppError("VALIDATION_FAILED", "That teammate isn't on this service line.");
  }
  if (lead.ownerId === ownerId) return;

  await withTransaction(async (tx) => {
    await assignLeadOwner(tx, { leadId, actor, fromOwnerId: lead.ownerId, toOwnerId: ownerId });
    await publishAfterCommit(tx, {
      name: "lead.assigned",
      actor,
      payload: { leadId, fromOwnerId: lead.ownerId, toOwnerId: ownerId },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.lead.assign",
      targetType: "acquisition.lead",
      targetId: leadId,
      after: { ownerId },
    });
  });
}
