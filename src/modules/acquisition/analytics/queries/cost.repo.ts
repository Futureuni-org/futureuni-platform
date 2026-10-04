/**
 * Cost analytics (Phase 17 efficiency): line-scoped AI, source and audit spend, in micro-USD
 * (ADR-027, internal accounting — never shown as client money). AI cost is read straight from the
 * `AiCall` rows joined to leads by `leadId` (the platform `getUsageSummary` is admin-gated and has
 * no service-line dimension, so it can't scope a line's cost; this is a different, line-scoped cut,
 * not a re-implementation of its logic). All Prisma access is here.
 */

import "server-only";

import type { Market, ServiceLine } from "@/contracts/common";
import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";

function leadJoinFilter(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  if (scope.ownerId !== undefined) clauses.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  return Prisma.join(clauses, " AND ");
}

export interface LineCostInputs {
  sourceCostMicros: number;
  aiCostMicros: number;
  auditCostMicros: number;
}

/** Source, AI and audit spend for a line in the range, for cost-per-lead. */
export async function getLineCostInputs(scope: CohortScope): Promise<LineCostInputs> {
  const [source, ai, audit] = await Promise.all([
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(sr."costMicros")::bigint AS total
      FROM acq_search_runs sr
      WHERE sr."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")
        AND sr."createdAt" >= ${scope.from} AND sr."createdAt" <= ${scope.to}
    `,
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(a."costMicros")::bigint AS total
      FROM ai_calls a
      JOIN acq_leads l ON l.id = a."leadId"
      WHERE a."createdAt" >= ${scope.from} AND a."createdAt" <= ${scope.to}
        AND ${leadJoinFilter(scope)}
    `,
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(au."costMicros")::bigint AS total
      FROM acq_audits au
      JOIN acq_leads l ON l.id = au."leadId"
      WHERE au."createdAt" >= ${scope.from} AND au."createdAt" <= ${scope.to}
        AND ${leadJoinFilter(scope)}
    `,
  ]);
  return {
    sourceCostMicros: Number(source[0]?.total ?? 0n),
    aiCostMicros: Number(ai[0]?.total ?? 0n),
    auditCostMicros: Number(audit[0]?.total ?? 0n),
  };
}

/** Total AI spend across every AI call made against leads won in the range. */
export async function getAiCostOfWonLeads(scope: CohortScope): Promise<number> {
  const rows = await db.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(a."costMicros")::bigint AS total
    FROM ai_calls a
    WHERE a."leadId" IN (
      SELECT d."leadId" FROM acq_deals d
      JOIN acq_leads l ON l.id = d."leadId"
      WHERE d.outcome = 'WON' AND d."closedAt" >= ${scope.from} AND d."closedAt" <= ${scope.to}
        AND ${leadJoinFilter(scope)}
    )
  `;
  return Number(rows[0]?.total ?? 0n);
}

export interface TaskCostRow {
  task: string;
  calls: number;
  costMicros: number;
}

/** AI spend by task for a line's leads in the range, most expensive first. */
export async function getAiCostByTask(scope: CohortScope, limit: number): Promise<TaskCostRow[]> {
  const rows = await db.$queryRaw<{ task: string; calls: bigint; total: bigint }[]>`
    SELECT a.task AS task, COUNT(*)::bigint AS calls, SUM(a."costMicros")::bigint AS total
    FROM ai_calls a
    JOIN acq_leads l ON l.id = a."leadId"
    WHERE a."createdAt" >= ${scope.from} AND a."createdAt" <= ${scope.to}
      AND ${leadJoinFilter(scope)}
    GROUP BY a.task
    ORDER BY total DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ task: r.task, calls: Number(r.calls), costMicros: Number(r.total) }));
}

export interface SourceCostRow {
  adapterId: string;
  leads: number;
  /** AI spend attributable to this source's leads, micro-USD. A lead sourced by several adapters
   * contributes to each, so this is an allocation, not a disjoint partition. */
  aiCostMicros: number;
}

/** AI cost per source adapter in the range, for the efficiency "cost per lead by source" chart. */
export async function getCostPerSource(scope: CohortScope): Promise<SourceCostRow[]> {
  const cohort = leadJoinFilter(scope);
  const rows = await db.$queryRaw<{ adapter: string; leads: bigint; ai_cost: bigint | null }[]>`
    WITH lead_ai AS (
      SELECT a."leadId" AS lead_id, SUM(a."costMicros")::bigint AS cost
      FROM ai_calls a JOIN acq_leads l ON l.id = a."leadId"
      WHERE l."createdAt" >= ${scope.from} AND l."createdAt" <= ${scope.to} AND ${cohort}
      GROUP BY a."leadId"
    ),
    lead_adapter AS (
      SELECT DISTINCT s."leadId" AS lead_id, s."adapterId" AS adapter
      FROM acq_signals s JOIN acq_leads l ON l.id = s."leadId"
      WHERE l."createdAt" >= ${scope.from} AND l."createdAt" <= ${scope.to} AND ${cohort}
    )
    SELECT la.adapter AS adapter,
           COUNT(DISTINCT la.lead_id)::bigint AS leads,
           COALESCE(SUM(lai.cost), 0)::bigint AS ai_cost
    FROM lead_adapter la
    LEFT JOIN lead_ai lai ON lai.lead_id = la.lead_id
    GROUP BY la.adapter
    ORDER BY leads DESC
  `;
  return rows.map((r) => ({
    adapterId: r.adapter,
    leads: Number(r.leads),
    aiCostMicros: Number(r.ai_cost ?? 0n),
  }));
}

export interface LineCostRow {
  serviceLine: ServiceLine;
  costMicros: number;
}

/** AI spend per service line in the range (for the overview AI-spend panel). */
export async function getAiCostByLine(args: {
  lines: ServiceLine[];
  market?: Market;
  from: Date;
  to: Date;
}): Promise<LineCostRow[]> {
  if (args.lines.length === 0) return [];
  const marketClause =
    args.market === undefined ? Prisma.empty : Prisma.sql`AND l."market" = CAST(${args.market} AS "Market")`;
  const rows = await db.$queryRaw<{ line: ServiceLine; total: bigint }[]>`
    SELECT l."serviceLine" AS line, SUM(a."costMicros")::bigint AS total
    FROM ai_calls a
    JOIN acq_leads l ON l.id = a."leadId"
    WHERE a."createdAt" >= ${args.from} AND a."createdAt" <= ${args.to}
      AND l."serviceLine" IN (${Prisma.join(args.lines.map((line) => Prisma.sql`CAST(${line} AS "ServiceLine")`))})
      ${marketClause}
    GROUP BY l."serviceLine"
  `;
  return rows.map((r) => ({ serviceLine: r.line, costMicros: Number(r.total) }));
}
