/**
 * Period time-series buckets (Phase 17 trends): leads found, first touches sent, genuine replies
 * and meetings, bucketed by day, week or month in the platform timezone (`Africa/Lagos`, INV-12).
 * Each series buckets by the instant the thing happened. Tagged-template `$queryRaw` only; the
 * `date_trunc` unit is a fixed literal chosen by a switch, never interpolated input.
 */

import "server-only";

import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";
import type { Granularity } from "../time";

const PLATFORM_TZ = "Africa/Lagos";

function truncExpr(granularity: Granularity, column: Prisma.Sql): Prisma.Sql {
  switch (granularity) {
    case "week":
      return Prisma.sql`to_char(date_trunc('week', (${column} AT TIME ZONE ${PLATFORM_TZ})), 'YYYY-MM-DD')`;
    case "month":
      return Prisma.sql`to_char(date_trunc('month', (${column} AT TIME ZONE ${PLATFORM_TZ})), 'YYYY-MM-DD')`;
    case "day":
      return Prisma.sql`to_char(date_trunc('day', (${column} AT TIME ZONE ${PLATFORM_TZ})), 'YYYY-MM-DD')`;
  }
}

/** Service-line and optional market filter on the joined lead (always aliased `l`). */
function lineMarketFilter(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) {
    clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  }
  return Prisma.join(clauses, " AND ");
}

export type SeriesKey = "leads_found" | "sent" | "reply_rate" | "meetings_booked";

async function bucketCounts(sql: Prisma.Sql): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ bucket: string; n: bigint }[]>(sql);
  return new Map(rows.map((r) => [r.bucket, Number(r.n)]));
}

/**
 * The four trend series as maps of bucket → count. The service aligns them onto a shared set of
 * buckets. `reply_rate` here is the count of genuine replies (the UI shows it as a replies trend).
 */
export async function getTrendSeries(
  scope: CohortScope,
  granularity: Granularity,
): Promise<Record<SeriesKey, Map<string, number>>> {
  const leadBucket = truncExpr(granularity, Prisma.sql`l."createdAt"`);
  const [leadsFound, sent, replies, meetings] = await Promise.all([
    bucketCounts(Prisma.sql`
      SELECT ${leadBucket} AS bucket, COUNT(*)::bigint AS n
      FROM acq_leads l
      WHERE l."createdAt" >= ${scope.from} AND l."createdAt" <= ${scope.to}
        AND ${lineMarketFilter(scope)}
      GROUP BY bucket ORDER BY bucket
    `),
    bucketCounts(Prisma.sql`
      SELECT ${truncExpr(granularity, Prisma.sql`m."sentAt"`)} AS bucket, COUNT(*)::bigint AS n
      FROM acq_messages m JOIN acq_leads l ON l.id = m."leadId"
      WHERE m."stepIndex" = 0 AND m.status IN ('SENT', 'SENT_MOCK', 'SENT_ASSISTED')
        AND m."sentAt" >= ${scope.from} AND m."sentAt" <= ${scope.to}
        AND ${lineMarketFilter(scope)}
      GROUP BY bucket ORDER BY bucket
    `),
    bucketCounts(Prisma.sql`
      SELECT ${truncExpr(granularity, Prisma.sql`r."receivedAt"`)} AS bucket, COUNT(*)::bigint AS n
      FROM acq_replies r JOIN acq_leads l ON l.id = r."leadId"
      WHERE r."receivedAt" >= ${scope.from} AND r."receivedAt" <= ${scope.to}
        AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
        AND ${lineMarketFilter(scope)}
      GROUP BY bucket ORDER BY bucket
    `),
    bucketCounts(Prisma.sql`
      SELECT ${truncExpr(granularity, Prisma.sql`mt."startsAt"`)} AS bucket, COUNT(*)::bigint AS n
      FROM acq_meetings mt JOIN acq_leads l ON l.id = mt."leadId"
      WHERE mt."startsAt" >= ${scope.from} AND mt."startsAt" <= ${scope.to}
        AND mt.status <> 'UNMATCHED'
        AND ${lineMarketFilter(scope)}
      GROUP BY bucket ORDER BY bucket
    `),
  ]);
  return { leads_found: leadsFound, sent, reply_rate: replies, meetings_booked: meetings };
}
