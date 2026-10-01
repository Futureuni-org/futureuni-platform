import "server-only";

/**
 * Borderline review (phase-11 Step 3). `runBorderlineReview` asks Claude for a second opinion and
 * stores it as a `ScoreReview`; it assists, it never decides. A human `acceptReview`s the AI
 * recommendation or `overrideReview`s it — the human decision is final, audited and recorded as
 * calibration feedback.
 */

import type { Actor, Clock, ReviewRecommendation } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { runTask } from "@/platform/ai";
import { audit } from "@/platform/audit-log";
import { assertActorCan } from "@/platform/auth";
import { withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { canTransition, transitionLead } from "@/modules/acquisition/core";

import { createScoreReview, getLatestReview, recordReviewDecision } from "./review.repo";
import { getLead, setNeedsHumanReview } from "./scoring.repo";
import type { BorderlineReviewInput, BorderlineReviewOutput } from "./tasks";

export interface BorderlineReviewResult {
  reviewId: string;
  recommendation: ReviewRecommendation;
  confidence: number;
  citedFindingIds: string[];
}

/** Runs the AI review and stores a ScoreReview row. Call outside a transaction (it makes a model call). */
export async function runBorderlineReview(
  input: BorderlineReviewInput,
  ctx: { actor: Actor; leadId: string; companyId: string },
): Promise<BorderlineReviewResult> {
  const result = await runTask<BorderlineReviewInput, BorderlineReviewOutput>({
    task: "acquisition.score-borderline-review",
    input,
    actor: ctx.actor,
    context: { leadId: ctx.leadId, companyId: ctx.companyId, module: "acquisition" },
  });

  // Defensive: keep only citations that point at real findings on this lead.
  const known = new Set(input.findings.map((f) => f.id));
  const citedFindingIds = result.output.citedFindingIds.filter((id) => known.has(id));

  const review = await createScoreReview({
    leadId: ctx.leadId,
    recommendation: result.output.recommendation,
    confidence: result.output.confidence,
    reasons: result.output.reasons,
    citedFindingIds,
    riskFlags: result.output.riskFlags,
    aiCallId: result.callId,
  });

  return {
    reviewId: review.id,
    recommendation: result.output.recommendation,
    confidence: result.output.confidence,
    citedFindingIds,
  };
}

function userIdOf(actor: Actor): string {
  if (actor.type !== "USER") {
    throw new AppError("FORBIDDEN", "Only a person can decide a review.");
  }
  return actor.userId;
}

async function applyDecision(
  actor: Actor,
  leadId: string,
  decision: { humanDecision: ReviewRecommendation; decisionType: "ACCEPTED" | "OVERRIDDEN"; note: string | null },
  clock: Clock,
): Promise<void> {
  const lead = await getLead(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.scoreReview.decide", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });

  const review = await getLatestReview(leadId);
  if (review === null) throw new AppError("NOT_FOUND", "This lead has no review to decide on.");

  const decidedById = userIdOf(actor);
  const now = clock.now();

  await withTransaction(async (tx) => {
    await recordReviewDecision(tx, review.id, {
      humanDecision: decision.humanDecision,
      decisionType: decision.decisionType,
      decidedById,
      decidedAt: now,
      overrideNote: decision.note,
    });

    if (decision.humanDecision === "DISQUALIFY" && canTransition(lead.status, "DISQUALIFIED", lead)) {
      const reason = decision.decisionType === "OVERRIDDEN" ? "review:override" : "review:accept";
      const { event } = await transitionLead(tx, {
        leadId,
        to: "DISQUALIFIED",
        actor,
        reason,
        clock,
      });
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
            reason,
          },
        });
      }
    }

    await setNeedsHumanReview(tx, leadId, false);
    await audit.record(tx, {
      actor,
      action: "acquisition.scoreReview.decide",
      targetType: "acquisition.lead",
      targetId: leadId,
      after: {
        reviewId: review.id,
        humanDecision: decision.humanDecision,
        decisionType: decision.decisionType,
      },
    });
  });
}

/** The human agrees with the AI recommendation and applies it. */
export async function acceptReview(
  actor: Actor,
  leadId: string,
  opts: { clock?: Clock } = {},
): Promise<void> {
  const review = await getLatestReview(leadId);
  if (review === null) throw new AppError("NOT_FOUND", "This lead has no review to decide on.");
  await applyDecision(
    actor,
    leadId,
    { humanDecision: review.recommendation, decisionType: "ACCEPTED", note: null },
    opts.clock ?? { now: () => new Date() },
  );
}

/** The human overrides the AI with a final decision and a note (recorded for calibration). */
export async function overrideReview(
  actor: Actor,
  leadId: string,
  decision: "QUALIFY" | "DISQUALIFY",
  note: string,
  opts: { clock?: Clock } = {},
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length === 0) throw new AppError("VALIDATION_FAILED", "An override needs a note.");
  await applyDecision(
    actor,
    leadId,
    { humanDecision: decision, decisionType: "OVERRIDDEN", note: trimmed },
    opts.clock ?? { now: () => new Date() },
  );
}
