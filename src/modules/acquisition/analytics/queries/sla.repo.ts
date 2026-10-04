/**
 * Reply SLA outcomes (Phase 17 responsiveness): the SLA-met rate and median first-response time,
 * per owner. Actionable replies are those carrying an SLA (slaStatus other than NONE); met are
 * those answered inside it (module spec §5 inbox SLA). The inbox module records the per-reply SLA
 * state; this is the first place it is aggregated for analytics, so it reads the fields directly.
 */

import "server-only";

import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";

function replyWhere(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`r."receivedAt" >= ${scope.from}`,
    Prisma.sql`r."receivedAt" <= ${scope.to}`,
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  if (scope.ownerId !== undefined) clauses.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  return Prisma.join(clauses, " AND ");
}

export interface SlaOwnerRow {
  ownerId: string;
  actionable: number;
  met: number;
  /** Median first-response time in milliseconds (null when no reply was answered). */
  medianMs: number | null;
}

/** SLA counts and median first-response time per owner, for replies received in the range. */
export async function getSlaByOwner(scope: CohortScope): Promise<SlaOwnerRow[]> {
  const rows = await db.$queryRaw<
    { owner: string; actionable: bigint; met: bigint; median_seconds: number | null }[]
  >`
    SELECT
      COALESCE(l."ownerId", '(unassigned)') AS owner,
      COUNT(*) FILTER (WHERE r."slaStatus" <> 'NONE')::bigint AS actionable,
      COUNT(*) FILTER (WHERE r."slaStatus" = 'MET')::bigint AS met,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (r."firstResponseAt" - r."receivedAt"))
      ) AS median_seconds
    FROM acq_replies r
    JOIN acq_leads l ON l.id = r."leadId"
    WHERE ${replyWhere(scope)}
    GROUP BY owner
    ORDER BY actionable DESC
  `;
  return rows.map((r) => ({
    ownerId: r.owner,
    actionable: Number(r.actionable),
    met: Number(r.met),
    medianMs: r.median_seconds === null ? null : Math.round(r.median_seconds * 1000),
  }));
}

export interface SlaOverall {
  actionable: number;
  met: number;
  medianMs: number | null;
}

/** SLA met rate and median first-response time across all owners, for the scalar metrics. */
export async function getSlaOverall(scope: CohortScope): Promise<SlaOverall> {
  const rows = await db.$queryRaw<
    { actionable: bigint; met: bigint; median_seconds: number | null }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE r."slaStatus" <> 'NONE')::bigint AS actionable,
      COUNT(*) FILTER (WHERE r."slaStatus" = 'MET')::bigint AS met,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (r."firstResponseAt" - r."receivedAt"))
      ) AS median_seconds
    FROM acq_replies r
    JOIN acq_leads l ON l.id = r."leadId"
    WHERE ${replyWhere(scope)}
  `;
  const row = rows[0];
  return {
    actionable: Number(row?.actionable ?? 0n),
    met: Number(row?.met ?? 0n),
    medianMs: row?.median_seconds == null ? null : Math.round(row.median_seconds * 1000),
  };
}
