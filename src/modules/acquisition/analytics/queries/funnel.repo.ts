/**
 * Cohort funnel counts (Phase 17). The cohort is the leads created inside the range; each stage
 * counts the distinct cohort leads that ever reached it, read from the append-only lead-event trail
 * (INV-1), so a lead parked in NURTURE after being scored still counts at every stage it reached.
 * `positive` has no lead status, so it is read from reply classifications.
 *
 * All access is Prisma-only here (CLAUDE.md §Conventions); the heavy distinct-count aggregates use
 * tagged-template `$queryRaw` (never string-built SQL) over indexed columns.
 */

import "server-only";

import type { LeadStatus, Market, ServiceLine } from "@/contracts/common";
import { db, Prisma } from "@/platform/db";

export interface CohortScope {
  serviceLine: ServiceLine;
  market?: Market;
  ownerId?: string;
  from: Date;
  to: Date;
}

/** The lead statuses that mark a funnel stage, in order. `positive` is handled separately. */
const STAGE_STATUS: { key: string; status: LeadStatus }[] = [
  { key: "enriched", status: "ENRICHED" },
  { key: "audited", status: "AUDITED" },
  { key: "scored", status: "SCORED" },
  { key: "approved", status: "APPROVED" },
  { key: "sent", status: "CONTACTED" },
  { key: "replied", status: "REPLIED" },
  { key: "meeting", status: "MEETING_BOOKED" },
  { key: "proposal", status: "PROPOSAL_SENT" },
  { key: "won", status: "WON" },
];

function leadWhere(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`l."createdAt" >= ${scope.from}`,
    Prisma.sql`l."createdAt" <= ${scope.to}`,
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) {
    clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  }
  if (scope.ownerId !== undefined) {
    clauses.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  }
  return Prisma.join(clauses, " AND ");
}

export interface CohortStageCounts {
  /** Cohort size: leads created in the range. */
  found: number;
  /** Distinct cohort leads that reached each stage, keyed by the stage key. */
  byStage: Record<string, number>;
  /** Distinct cohort leads with a positive (INTERESTED/QUESTION) reply. */
  positive: number;
}

async function countFound(scope: CohortScope): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM acq_leads l
    WHERE ${leadWhere(scope)}
  `;
  return Number(rows[0]?.n ?? 0n);
}

async function countByStage(scope: CohortScope): Promise<Record<string, number>> {
  const statuses = STAGE_STATUS.map((s) => s.status);
  const rows = await db.$queryRaw<{ stage: LeadStatus; n: bigint }[]>`
    SELECT le."toStatus" AS stage, COUNT(DISTINCT le."leadId")::bigint AS n
    FROM acq_lead_events le
    JOIN acq_leads l ON l.id = le."leadId"
    WHERE le.kind = 'STATUS_CHANGE'
      AND le."toStatus" IN (${Prisma.join(statuses)})
      AND ${leadWhere(scope)}
    GROUP BY le."toStatus"
  `;
  const byStatus = new Map<string, number>(rows.map((r) => [r.stage, Number(r.n)]));
  const out: Record<string, number> = {};
  for (const { key, status } of STAGE_STATUS) out[key] = byStatus.get(status) ?? 0;
  return out;
}

async function countPositive(scope: CohortScope): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT r."leadId")::bigint AS n
    FROM acq_replies r
    JOIN acq_leads l ON l.id = r."leadId"
    WHERE r.classification IN ('INTERESTED', 'QUESTION')
      AND ${leadWhere(scope)}
  `;
  return Number(rows[0]?.n ?? 0n);
}

/** Cohort stage counts for the funnel and the cohort-based rates. */
export async function getCohortStageCounts(scope: CohortScope): Promise<CohortStageCounts> {
  const [found, byStage, positive] = await Promise.all([
    countFound(scope),
    countByStage(scope),
    countPositive(scope),
  ]);
  return { found, byStage, positive };
}
