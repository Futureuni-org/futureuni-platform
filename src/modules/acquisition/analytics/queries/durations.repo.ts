/**
 * Duration metrics (Phase 17): time to first reply (cohort) and time in stage (period). Time to
 * close is provided by the reused pipeline revenue service, so it is not repeated here. Medians and
 * the 75th percentile are computed in Postgres with `percentile_cont`; results are milliseconds.
 */

import "server-only";

import type { LeadStatus } from "@/contracts/common";
import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";

function cohortWhere(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`l."createdAt" >= ${scope.from}`,
    Prisma.sql`l."createdAt" <= ${scope.to}`,
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  if (scope.ownerId !== undefined) clauses.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  return Prisma.join(clauses, " AND ");
}

const secondsToMs = (s: number | null): number | null => (s === null ? null : Math.round(s * 1000));

export interface MedianP75 {
  medianMs: number | null;
  p75Ms: number | null;
}

/** Time from first contact to the first genuine reply, for the cohort (median and p75). */
export async function getTimeToFirstReply(scope: CohortScope): Promise<MedianP75> {
  const rows = await db.$queryRaw<{ p50: number | null; p75: number | null }[]>`
    WITH fr AS (
      SELECT
        l."firstContactedAt" AS contacted,
        (
          SELECT MIN(r."receivedAt") FROM acq_replies r
          WHERE r."leadId" = l.id
            AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
        ) AS first_reply
      FROM acq_leads l
      WHERE ${cohortWhere(scope)} AND l."firstContactedAt" IS NOT NULL
    )
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_reply - contacted))) AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_reply - contacted))) AS p75
    FROM fr
    WHERE first_reply IS NOT NULL AND first_reply >= contacted
  `;
  const row = rows[0];
  return { medianMs: secondsToMs(row?.p50 ?? null), p75Ms: secondsToMs(row?.p75 ?? null) };
}

export interface TimeInStageRow {
  stage: LeadStatus;
  medianMs: number | null;
}

/**
 * Median time a lead spent in each stage, from consecutive status-change events. A stage's time is
 * the gap between entering it and the next status change; stages entered in the range are included.
 */
export async function getTimeInStage(scope: CohortScope): Promise<TimeInStageRow[]> {
  const lineFilter: Prisma.Sql[] = [
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) lineFilter.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  if (scope.ownerId !== undefined) lineFilter.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  const rows = await db.$queryRaw<{ stage: LeadStatus; median_seconds: number | null }[]>`
    WITH ev AS (
      SELECT
        le."toStatus" AS stage,
        le."createdAt" AS entered,
        LEAD(le."createdAt") OVER (PARTITION BY le."leadId" ORDER BY le."createdAt") AS next_at
      FROM acq_lead_events le
      JOIN acq_leads l ON l.id = le."leadId"
      WHERE le.kind = 'STATUS_CHANGE' AND le."toStatus" IS NOT NULL
        AND ${Prisma.join(lineFilter, " AND ")}
    )
    SELECT stage, percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (next_at - entered))) AS median_seconds
    FROM ev
    WHERE next_at IS NOT NULL AND entered >= ${scope.from} AND entered <= ${scope.to}
    GROUP BY stage
  `;
  return rows.map((r) => ({ stage: r.stage, medianMs: secondsToMs(r.median_seconds) }));
}
