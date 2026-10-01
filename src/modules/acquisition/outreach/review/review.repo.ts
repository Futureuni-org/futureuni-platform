import "server-only";

/**
 * Reads for the approval queue (naming convention: `*.repo.ts`). Returns draft messages awaiting
 * review with the lead, company and contact context Phase 15 renders.
 */

import { dbOr, type Prisma, type Tx } from "@/platform/db";

const QUEUE_INCLUDE = {
  lead: {
    select: {
      id: true,
      serviceLine: true,
      market: true,
      ownerId: true,
      status: true,
      score: true,
      scoreBand: true,
      brief: true,
      keyFindingIds: true,
      needsHumanReview: true,
      complianceReview: true,
      crossSellGroupId: true,
      heldByCrossSell: true,
    },
  },
  company: { select: { id: true, name: true, country: true, city: true, normalizedDomain: true } },
  contact: { select: { id: true, name: true, firstName: true, role: true, email: true, whatsappStatus: true } },
  citations: { select: { findingId: true, signalId: true } },
} satisfies Prisma.MessageInclude;

export type ReviewQueueRow = Prisma.MessageGetPayload<{ include: typeof QUEUE_INCLUDE }>;

export interface ReviewQueueFilter {
  serviceLine?: string;
  market?: string;
  ownerId?: string;
  needsHumanReview?: boolean;
  complianceReview?: boolean;
  cursor?: string;
  limit: number;
}

export async function queryReviewQueue(
  tx: Tx | null,
  filter: ReviewQueueFilter,
): Promise<{ rows: ReviewQueueRow[]; nextCursor: string | null }> {
  const where: Prisma.MessageWhereInput = {
    status: { in: ["DRAFT", "NEEDS_EDIT"] },
    lead: {
      ...(filter.serviceLine === undefined ? {} : { serviceLine: filter.serviceLine as never }),
      ...(filter.market === undefined ? {} : { market: filter.market as never }),
      ...(filter.ownerId === undefined ? {} : { ownerId: filter.ownerId }),
      ...(filter.needsHumanReview === undefined ? {} : { needsHumanReview: filter.needsHumanReview }),
      ...(filter.complianceReview === undefined ? {} : { complianceReview: filter.complianceReview }),
    },
    ...(filter.cursor === undefined ? {} : { id: { lt: filter.cursor } }),
  };
  const rows = await dbOr(tx).message.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filter.limit + 1,
    include: QUEUE_INCLUDE,
  });
  const items = rows.slice(0, filter.limit);
  const last = items[items.length - 1];
  return { rows: items, nextCursor: rows.length > filter.limit && last !== undefined ? last.id : null };
}
