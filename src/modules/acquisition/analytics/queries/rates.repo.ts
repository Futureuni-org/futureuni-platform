/**
 * Rate inputs and period counts the reused pipeline services don't provide (Phase 17):
 * cohort reply/unsubscribe/bounce counts, first-touch send and approval counts, and the average
 * score. Cohort counts follow leads created in the range; period counts count events in the range.
 * Reply-rate excludes OUT_OF_OFFICE and BOUNCE auto-replies (module spec §3.14).
 */

import "server-only";

import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";

const SENT_STATUSES = ["SENT", "SENT_MOCK", "SENT_ASSISTED"] as const;

function leadCohortWhere(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`l."createdAt" >= ${scope.from}`,
    Prisma.sql`l."createdAt" <= ${scope.to}`,
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  if (scope.ownerId !== undefined) clauses.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  return Prisma.join(clauses, " AND ");
}

export interface CohortRateCounts {
  /** Distinct cohort leads with a first contact. */
  contacted: number;
  /** Distinct cohort leads with a genuine reply (not out-of-office, not bounce). */
  replied: number;
  /** Distinct cohort leads that unsubscribed. */
  unsubscribed: number;
  /** Distinct cohort leads whose address bounced. */
  bounced: number;
}

export async function getCohortRateCounts(scope: CohortScope): Promise<CohortRateCounts> {
  const where = leadCohortWhere(scope);
  const [contacted, replied, unsubscribed, bounced] = await Promise.all([
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM acq_leads l
      WHERE ${where} AND l."firstContactedAt" IS NOT NULL
    `,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT r."leadId")::bigint AS n
      FROM acq_replies r JOIN acq_leads l ON l.id = r."leadId"
      WHERE ${where}
        AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
    `,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT r."leadId")::bigint AS n
      FROM acq_replies r JOIN acq_leads l ON l.id = r."leadId"
      WHERE ${where} AND r.classification = 'UNSUBSCRIBE'
    `,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT r."leadId")::bigint AS n
      FROM acq_replies r JOIN acq_leads l ON l.id = r."leadId"
      WHERE ${where} AND r.classification = 'BOUNCE'
    `,
  ]);
  return {
    contacted: Number(contacted[0]?.n ?? 0n),
    replied: Number(replied[0]?.n ?? 0n),
    unsubscribed: Number(unsubscribed[0]?.n ?? 0n),
    bounced: Number(bounced[0]?.n ?? 0n),
  };
}

function messageLeadFilter(scope: CohortScope): Prisma.LeadWhereInput {
  return {
    serviceLine: scope.serviceLine,
    ...(scope.market === undefined ? {} : { market: scope.market }),
    ...(scope.ownerId === undefined ? {} : { ownerId: scope.ownerId }),
  };
}

export interface PeriodCounts {
  /** First touches sent in the range (email sent plus confirmed assisted sends). */
  sent: number;
}

/** First touches sent in the range: step-0 sequence messages in a sent state. */
export async function getSentCount(scope: CohortScope): Promise<number> {
  return db.message.count({
    where: {
      stepIndex: 0,
      status: { in: [...SENT_STATUSES] },
      sentAt: { gte: scope.from, lte: scope.to },
      lead: messageLeadFilter(scope),
    },
  });
}

export interface ApprovalCounts {
  reviewed: number;
  approved: number;
}

/**
 * First-touch draft approvals in the range. Reviewed = drafts a person approved or rejected;
 * approved = those a person approved (auto-approved sends are excluded, since they weren't reviewed).
 */
export async function getApprovalCounts(scope: CohortScope): Promise<ApprovalCounts> {
  const leadFilter = messageLeadFilter(scope);
  const [approved, rejected] = await Promise.all([
    db.message.count({
      where: {
        stepIndex: 0,
        autoApproved: false,
        approvedAt: { gte: scope.from, lte: scope.to },
        lead: leadFilter,
      },
    }),
    db.message.count({
      where: {
        stepIndex: 0,
        status: "REJECTED",
        updatedAt: { gte: scope.from, lte: scope.to },
        lead: leadFilter,
      },
    }),
  ]);
  return { reviewed: approved + rejected, approved };
}

/** Mean score of leads scored in the range (null when none were scored). */
export async function getAverageScore(scope: CohortScope): Promise<number | null> {
  const result = await db.lead.aggregate({
    where: {
      serviceLine: scope.serviceLine,
      ...(scope.market === undefined ? {} : { market: scope.market }),
      ...(scope.ownerId === undefined ? {} : { ownerId: scope.ownerId }),
      scoredAt: { gte: scope.from, lte: scope.to },
      score: { not: null },
    },
    _avg: { score: true },
  });
  return result._avg.score;
}

export interface ProposalCounts {
  sent: number;
  accepted: number;
}

/** Proposals sent and accepted in the range, for proposals-sent and acceptance-rate metrics. */
export async function getProposalCounts(scope: CohortScope): Promise<ProposalCounts> {
  const leadFilter = messageLeadFilter(scope);
  const [sent, accepted] = await Promise.all([
    db.proposal.count({
      where: { sentAt: { gte: scope.from, lte: scope.to }, lead: leadFilter },
    }),
    db.proposal.count({
      where: { acceptedAt: { gte: scope.from, lte: scope.to }, lead: leadFilter },
    }),
  ]);
  return { sent, accepted };
}
