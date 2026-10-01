import "server-only";

import type { ReviewDecisionType, ReviewRecommendation } from "@/contracts/common";
import { db, type ScoreReview, type Tx } from "@/platform/db";

export async function createScoreReview(input: {
  leadId: string;
  recommendation: ReviewRecommendation;
  confidence: number;
  reasons: string[];
  citedFindingIds: string[];
  riskFlags: string[];
  aiCallId: string | null;
}): Promise<ScoreReview> {
  return db.scoreReview.create({ data: input });
}

export async function getLatestReview(leadId: string): Promise<ScoreReview | null> {
  return db.scoreReview.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
}

export async function recordReviewDecision(
  tx: Tx,
  reviewId: string,
  input: {
    humanDecision: ReviewRecommendation;
    decisionType: ReviewDecisionType;
    decidedById: string;
    decidedAt: Date;
    overrideNote: string | null;
  },
): Promise<void> {
  await tx.scoreReview.update({ where: { id: reviewId }, data: input });
}

/** Full score history (SCORE_CHANGE events) plus the latest review, for the UI score panel. */
export async function getScoreHistory(leadId: string): Promise<
  { createdAt: Date; meta: unknown }[]
> {
  const events = await db.leadEvent.findMany({
    where: { leadId, kind: "SCORE_CHANGE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, meta: true },
    take: 50,
  });
  return events.map((e) => ({ createdAt: e.createdAt, meta: e.meta }));
}
