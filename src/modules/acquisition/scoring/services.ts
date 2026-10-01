import "server-only";

/**
 * Read and action services for the UI (phase-11 Step 8). Reads need no actor (the caller scopes);
 * `rescoreLead` is a mutation and checks `acquisition.lead.rescore`.
 */

import type { Actor, ScoreBand, ServiceLine } from "@/contracts/common";
import type { ScoreReason } from "@/contracts/service-line-profile";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";

import { qualifyLead, type QualifyResult } from "./qualify";
import { getLatestReview, getScoreHistory } from "./review.repo";
import { getLead } from "./scoring.repo";
import { ALL_SERVICE_LINES, computeThrottle } from "./throttle";

export interface LeadScoreView {
  leadId: string;
  score: number | null;
  band: ScoreBand | null;
  reasons: ScoreReason[];
  scoredAt: Date | null;
  needsHumanReview: boolean;
  review: Awaited<ReturnType<typeof getLatestReview>>;
  history: { createdAt: Date; meta: unknown }[];
}

/** The full score picture for a lead: reasons, the latest review and the score history. */
export async function getLeadScore(leadId: string): Promise<LeadScoreView | null> {
  const lead = await getLead(leadId);
  if (lead === null) return null;
  const [review, history] = await Promise.all([getLatestReview(leadId), getScoreHistory(leadId)]);
  return {
    leadId,
    score: lead.score,
    band: lead.scoreBand,
    reasons: (lead.scoreReasons as unknown as ScoreReason[] | null) ?? [],
    scoredAt: lead.scoredAt,
    needsHumanReview: lead.needsHumanReview,
    review,
    history,
  };
}

/** Re-scores a lead on demand (US-14). Checks `acquisition.lead.rescore`. */
export async function rescoreLead(actor: Actor, leadId: string): Promise<QualifyResult> {
  const lead = await getLead(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.rescore", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });
  return qualifyLead(leadId, { actor });
}

export interface ThrottleStatus {
  line: ServiceLine;
  mode: "NORMAL" | "SLOW" | "PAUSED";
  dailyCap: number;
  newFirstTouchesToday: number;
  remaining: number;
  percent: number;
  reason: string;
}

/** The throttle status for every line (the settings/overview capacity view). */
export async function getThrottleStatus(): Promise<ThrottleStatus[]> {
  const now = new Date();
  const out: ThrottleStatus[] = [];
  for (const line of ALL_SERVICE_LINES) {
    const t = await computeThrottle(line, now);
    out.push({
      line,
      mode: t.mode,
      dailyCap: t.dailyCap,
      newFirstTouchesToday: t.newFirstTouchesToday,
      remaining: Math.max(0, t.dailyCap - t.newFirstTouchesToday),
      percent: t.percent,
      reason: t.reason,
    });
  }
  return out;
}
