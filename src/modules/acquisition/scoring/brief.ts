import "server-only";

/**
 * Lead briefs (phase-11 Step 4). `generateBrief` asks Claude for a short, cited brief, validates that
 * it cites only real findings and suggests only a real pitch angle (one repair attempt, then it
 * fails), strips citation markers and stores it. `getLeadBrief` is SEAM-LEAD-BRIEF.
 */

import type { Actor, Clock } from "@/contracts/common";
import type { ScoreReason } from "@/contracts/service-line-profile";
import { AppError } from "@/lib/errors";
import { runTask, stripCitationMarkers } from "@/platform/ai";
import { db, withTransaction } from "@/platform/db";

import { getCrossSellContext } from "@/modules/acquisition/crosssell";

import { loadScoringInputs, readLeadBriefFields, saveBrief } from "./scoring.repo";
import type { LeadBriefInput, LeadBriefOutput } from "./tasks";

/** Pure validation: key findings must exist on the lead; the angle must be a real candidate. */
export function validateBrief(
  output: LeadBriefOutput,
  allowed: { findingIds: ReadonlySet<string>; angleIds: ReadonlySet<string> },
): string[] {
  const errors: string[] = [];
  for (const id of output.keyFindingIds) {
    if (!allowed.findingIds.has(id)) errors.push(`keyFindingIds: unknown finding ${id}`);
  }
  if (output.suggestedAngleId !== null && !allowed.angleIds.has(output.suggestedAngleId)) {
    errors.push(`suggestedAngleId: unknown angle ${output.suggestedAngleId}`);
  }
  return errors;
}

export interface LeadBrief {
  brief: string;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  talkingPoints: string[];
}

/** Generates, validates and stores the brief for a scored lead. Call outside the scoring transaction. */
export async function generateBrief(
  leadId: string,
  ctx: { actor: Actor; clock?: Clock },
): Promise<LeadBrief> {
  const clock = ctx.clock ?? { now: () => new Date() };
  const inputs = await loadScoringInputs(db, leadId);
  if (inputs === null) {
    throw new AppError("AI_OUTPUT_INVALID", "No lead to brief.", { details: { leadId } });
  }
  const { lead, company } = inputs;
  const nonDismissed = inputs.findings.filter((f) => f.dismissedAt === null);
  const findingIds = new Set(nonDismissed.map((f) => f.id));

  const { getActiveProfile, resolvePitchAngle } = await import("@/modules/acquisition/profiles");
  const profile = await getActiveProfile(lead.serviceLine);
  const ranked = resolvePitchAngle(profile, lead.market, {
    signals: inputs.signals.map((s) => s.signalType),
    findings: nonDismissed.map((f) => ({ checkId: f.checkId })),
  });
  const angleCandidates = ranked.slice(0, 5).map((r) => ({ id: r.angle.id, hook: r.angle.hook }));
  const angleIds = new Set(angleCandidates.map((a) => a.id));

  const crossSell = await getCrossSellContext(leadId);

  const input: LeadBriefInput = {
    companyName: company.name,
    serviceLine: lead.serviceLine,
    market: lead.market,
    scoreReasons: ((lead.scoreReasons as unknown as ScoreReason[] | null) ?? []).map((r) => ({
      ruleId: r.ruleId,
      label: r.label,
      points: r.points,
    })),
    signals: inputs.signals.map((s) => ({ id: s.id, signalType: s.signalType })),
    findings: nonDismissed.map((f) => ({
      id: f.id,
      checkId: f.checkId,
      claim: f.claim,
      severity: f.severity,
      pitchable: f.pitchable,
    })),
    angleCandidates,
    crossSell: { isLeading: crossSell.isLeading, lines: crossSell.lines },
  };

  let output = await runBriefOnce(input, leadId, company.id, ctx.actor);
  let errors = validateBrief(output, { findingIds, angleIds });
  if (errors.length > 0) {
    // One repair attempt (AC-16.2): ask again, then fail rather than store an invalid brief.
    output = await runBriefOnce(input, leadId, company.id, ctx.actor);
    errors = validateBrief(output, { findingIds, angleIds });
    if (errors.length > 0) throw new AppError("AI_OUTPUT_INVALID", "Lead brief failed validation.", { details: { errors } });
  }

  const result: LeadBrief = {
    brief: stripCitationMarkers(output.brief).trim(),
    keyFindingIds: output.keyFindingIds,
    suggestedAngleId: output.suggestedAngleId,
    talkingPoints: output.talkingPoints,
  };

  await withTransaction((tx) =>
    saveBrief(tx, leadId, { ...result, now: clock.now() }),
  );
  return result;
}

async function runBriefOnce(
  input: LeadBriefInput,
  leadId: string,
  companyId: string,
  actor: Actor,
): Promise<LeadBriefOutput> {
  const res = await runTask<LeadBriefInput, LeadBriefOutput>({
    task: "acquisition.score-lead-brief",
    input,
    actor,
    context: { leadId, companyId, module: "acquisition" },
  });
  return res.output;
}

/** SEAM-LEAD-BRIEF. */
export async function getLeadBrief(leadId: string): Promise<{
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  score: number | null;
  scoreReasons: { ruleId: string; points: number; label: string }[];
}> {
  const fields = await readLeadBriefFields(leadId);
  if (fields === null) {
    return { brief: null, keyFindingIds: [], suggestedAngleId: null, score: null, scoreReasons: [] };
  }
  return {
    brief: fields.brief,
    keyFindingIds: fields.keyFindingIds,
    suggestedAngleId: fields.suggestedAngleId,
    score: fields.score,
    scoreReasons: fields.scoreReasons.map((r) => ({ ruleId: r.ruleId, points: r.points, label: r.label })),
  };
}
