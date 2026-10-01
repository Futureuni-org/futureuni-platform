import "server-only";

/**
 * Database access for scoring (the only scoring file that touches Prisma, besides throttle.repo and
 * the cross-sell repo). Reads the inputs the engine needs, persists the score, writes score-history
 * `LeadEvent` rows (SCORE_CHANGE), and answers the calibration query.
 */

import type { Actor, JsonValue, ScoreBand, ServiceLine } from "@/contracts/common";
import type { ScoreReason } from "@/contracts/service-line-profile";
import { leadEventActor } from "@/modules/acquisition/core";
import {
  db,
  toJsonInput,
  type AuditFinding,
  type Company,
  type Contact,
  type Lead,
  type Signal,
  type Tx,
} from "@/platform/db";

/** Everything the facts builder needs, loaded in one round-trip. */
export interface ScoringInputs {
  lead: Lead;
  company: Company;
  primaryContact: Contact | null;
  signals: Pick<Signal, "id" | "signalType">[];
  findings: Pick<AuditFinding, "id" | "checkId" | "severity" | "pitchable" | "dismissedAt" | "claim">[];
}

/** Loads a lead with the company, primary contact, its line's signals and its findings. */
export async function loadScoringInputs(
  tx: Tx,
  leadId: string,
): Promise<ScoringInputs | null> {
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  if (lead === null) return null;

  const [company, primaryContact, signals, findings] = await Promise.all([
    tx.company.findUniqueOrThrow({ where: { id: lead.companyId } }),
    lead.primaryContactId === null
      ? Promise.resolve(null)
      : tx.contact.findUnique({ where: { id: lead.primaryContactId } }),
    tx.signal.findMany({
      where: { leadId: lead.id, serviceLine: lead.serviceLine },
      select: { id: true, signalType: true },
    }),
    tx.auditFinding.findMany({
      where: { leadId: lead.id },
      select: { id: true, checkId: true, severity: true, pitchable: true, dismissedAt: true, claim: true },
    }),
  ]);

  return { lead, company, primaryContact, signals, findings };
}

/** Persists the score, band, reasons and scoredAt on the lead. Call inside the scoring transaction. */
export async function saveScore(
  tx: Tx,
  leadId: string,
  input: { score: number; band: ScoreBand; reasons: ScoreReason[]; needsHumanReview: boolean; now: Date },
): Promise<void> {
  await tx.lead.update({
    where: { id: leadId },
    data: {
      score: input.score,
      scoreBand: input.band,
      scoreReasons: toJsonInput(input.reasons as unknown as JsonValue),
      needsHumanReview: input.needsHumanReview,
      scoredAt: input.now,
    },
  });
}

/** Persists the lead brief fields. Call after the brief AI task returns. */
export async function saveBrief(
  tx: Tx,
  leadId: string,
  input: {
    brief: string;
    keyFindingIds: string[];
    suggestedAngleId: string | null;
    talkingPoints: string[];
    now: Date;
  },
): Promise<void> {
  await tx.lead.update({
    where: { id: leadId },
    data: {
      brief: input.brief,
      keyFindingIds: input.keyFindingIds,
      suggestedAngleId: input.suggestedAngleId,
      talkingPoints: input.talkingPoints,
      briefGeneratedAt: input.now,
    },
  });
}

/**
 * Writes a SCORE_CHANGE history row (score history lives in LeadEvent.meta, module spec §3.8). Not a
 * status change, so it never goes through transitionLead; INV-1 covers status changes, this is extra
 * history. No personal data — rule ids and points only.
 */
export async function recordScoreChange(
  tx: Tx,
  input: {
    leadId: string;
    actor: Actor;
    previousScore: number | null;
    score: number;
    band: ScoreBand;
    reasons: ScoreReason[];
  },
): Promise<void> {
  await tx.leadEvent.create({
    data: {
      leadId: input.leadId,
      kind: "SCORE_CHANGE",
      ...leadEventActor(input.actor),
      reason: null,
      meta: toJsonInput({
        previousScore: input.previousScore,
        score: input.score,
        band: input.band,
        reasons: input.reasons.map((r) => ({ ruleId: r.ruleId, points: r.points })),
      }),
    },
  });
}

/** The SEAM-LEAD-BRIEF read shape plus the fields callers need; reused by getLeadBrief and services. */
export async function readLeadBriefFields(leadId: string): Promise<{
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  score: number | null;
  scoreReasons: ScoreReason[];
} | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { brief: true, keyFindingIds: true, suggestedAngleId: true, score: true, scoreReasons: true },
  });
  if (lead === null) return null;
  return {
    brief: lead.brief,
    keyFindingIds: lead.keyFindingIds,
    suggestedAngleId: lead.suggestedAngleId,
    score: lead.score,
    scoreReasons: (lead.scoreReasons as unknown as ScoreReason[] | null) ?? [],
  };
}

/** Leads due for a nightly re-score: SCORED, pre-contact, scored before `before`. */
export async function findStaleScoredLeads(
  before: Date,
  limit: number,
): Promise<{ id: string }[]> {
  return db.lead.findMany({
    where: {
      status: "SCORED",
      firstContactedAt: null,
      OR: [{ scoredAt: null }, { scoredAt: { lt: before } }],
    },
    orderBy: { scoredAt: "asc" },
    take: limit,
    select: { id: true },
  });
}

/** A plain lead row (for the service layer's authorization and transitions). */
export async function getLead(leadId: string): Promise<Lead | null> {
  return db.lead.findUnique({ where: { id: leadId } });
}

/** Whether a user's team profile covers a service line (for assignLead, AC-41.4). */
export async function userHasServiceLine(userId: string, line: ServiceLine): Promise<boolean> {
  const profile = await db.teamProfile.findUnique({
    where: { userId },
    select: { serviceLines: true },
  });
  return profile?.serviceLines.includes(line) ?? false;
}

/** Changes the lead owner and writes an OWNER_CHANGE history row in the same transaction. */
export async function assignLeadOwner(
  tx: Tx,
  input: { leadId: string; actor: Actor; fromOwnerId: string | null; toOwnerId: string },
): Promise<void> {
  await tx.lead.update({ where: { id: input.leadId }, data: { ownerId: input.toOwnerId } });
  await tx.leadEvent.create({
    data: {
      leadId: input.leadId,
      kind: "OWNER_CHANGE",
      ...leadEventActor(input.actor),
      reason: null,
      meta: toJsonInput({ fromOwnerId: input.fromOwnerId, toOwnerId: input.toOwnerId }),
    },
  });
}

/** Clears or sets the human-review flag on a lead. */
export async function setNeedsHumanReview(tx: Tx, leadId: string, value: boolean): Promise<void> {
  await tx.lead.update({ where: { id: leadId }, data: { needsHumanReview: value } });
}

/** AUDITED leads waiting to be scored (the batch job). */
export async function findAuditedLeads(limit: number): Promise<{ id: string }[]> {
  return db.lead.findMany({
    where: { status: "AUDITED" },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
}
