/**
 * Conversion breakdowns by dimension (Phase 17 "what converts"): for each dimension value, the
 * cohort sample size and how many of those leads produced a genuine reply. Conversion by signal and
 * by pitch angle are the highest-value cuts, so they are first-class here. The caller turns the
 * raw key into a label and computes the rate; small samples are muted in the UI.
 *
 * Tagged-template `$queryRaw` only. The per-dimension key and join are built from a fixed switch,
 * never from interpolated input.
 */

import "server-only";

import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";
import type { BreakdownDimension } from "../types";

interface DimensionSql {
  /** Expression that yields the bucket key (already coalesced to a non-null string). */
  key: Prisma.Sql;
  /** Extra FROM join (empty for lead-only dimensions). */
  join: Prisma.Sql;
}

function dimensionSql(dimension: BreakdownDimension): DimensionSql {
  switch (dimension) {
    case "market":
      return { key: Prisma.sql`l."market"::text`, join: Prisma.empty };
    case "country":
      return { key: Prisma.sql`COALESCE(l."country", 'Unknown')`, join: Prisma.empty };
    case "owner":
      return { key: Prisma.sql`COALESCE(l."ownerId", '(unassigned)')`, join: Prisma.empty };
    case "source":
      return {
        key: Prisma.sql`s."adapterId"`,
        join: Prisma.sql`JOIN acq_signals s ON s."leadId" = l.id`,
      };
    case "signal":
      return {
        key: Prisma.sql`s."signalType"`,
        join: Prisma.sql`JOIN acq_signals s ON s."leadId" = l.id`,
      };
    case "channel":
      return {
        key: Prisma.sql`m."channel"::text`,
        join: Prisma.sql`JOIN acq_messages m ON m."leadId" = l.id AND m."stepIndex" = 0`,
      };
    case "pitchAngle":
      return {
        key: Prisma.sql`COALESCE(m."angleId", '(none)')`,
        join: Prisma.sql`JOIN acq_messages m ON m."leadId" = l.id AND m."stepIndex" = 0`,
      };
  }
}

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

export interface BreakdownCountRow {
  key: string;
  sample: number;
  numerator: number;
}

/**
 * Reply-conversion rows for one dimension, ordered by sample size. Numerator is cohort leads with a
 * genuine reply (not out-of-office, not bounce).
 */
export async function getBreakdownCounts(
  scope: CohortScope,
  dimension: BreakdownDimension,
): Promise<BreakdownCountRow[]> {
  const { key, join } = dimensionSql(dimension);
  const rows = await db.$queryRaw<{ key: string; sample: bigint; numerator: bigint }[]>`
    SELECT ${key} AS key,
           COUNT(DISTINCT l.id)::bigint AS sample,
           COUNT(DISTINCT l.id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM acq_replies r
               WHERE r."leadId" = l.id
                 AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
             )
           )::bigint AS numerator
    FROM acq_leads l
    ${join}
    WHERE ${cohortWhere(scope)}
    GROUP BY key
    ORDER BY sample DESC
  `;
  return rows.map((r) => ({ key: r.key, sample: Number(r.sample), numerator: Number(r.numerator) }));
}
