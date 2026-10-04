/**
 * Reply heatmap (Phase 17 responsiveness): for first-touch sends in the range, the reply rate by
 * weekday × hour in the recipient's local time (module spec §3.14; INV-12). Bucketing happens in
 * SQL using the same country → timezone map as `recipientTimezone`, so a 50k dataset returns one
 * grouped result instead of a row per send. Weekday is 0 = Sunday … 6 = Saturday (Postgres DOW),
 * matching `weekdayHour`.
 */

import "server-only";

import { db, Prisma } from "@/platform/db";

import type { CohortScope } from "./funnel.repo";
import { COUNTRY_TIMEZONE } from "../time";

/** CASE mapping `l.country` to an IANA timezone, falling back to the market default. */
function recipientTzExpr(): Prisma.Sql {
  const whens = Object.entries(COUNTRY_TIMEZONE).map(
    ([code, tz]) => Prisma.sql`WHEN ${code} THEN ${tz}`,
  );
  return Prisma.sql`
    COALESCE(
      CASE l."country" ${Prisma.join(whens, " ")} ELSE NULL END,
      CASE l."market" WHEN 'NIGERIA' THEN 'Africa/Lagos' ELSE 'UTC' END
    )
  `;
}

function lineMarketFilter(scope: CohortScope): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`l."serviceLine" = CAST(${scope.serviceLine} AS "ServiceLine")`,
  ];
  if (scope.market !== undefined) clauses.push(Prisma.sql`l."market" = CAST(${scope.market} AS "Market")`);
  if (scope.ownerId !== undefined) clauses.push(Prisma.sql`l."ownerId" = ${scope.ownerId}`);
  return Prisma.join(clauses, " AND ");
}

export interface HeatmapCountRow {
  weekday: number;
  hour: number;
  sent: number;
  replied: number;
}

/**
 * Sends and genuine replies per weekday × hour, in recipient local time. A send counts in the cell
 * of its own send time; a reply counts in the same cell as the send it answered (so the ratio reads
 * as "sends made at this time that got a reply"), which is what informs send windows.
 */
export async function getReplyHeatmapCounts(scope: CohortScope): Promise<HeatmapCountRow[]> {
  const tz = recipientTzExpr();
  const rows = await db.$queryRaw<
    { weekday: number; hour: number; sent: bigint; replied: bigint }[]
  >`
    SELECT
      EXTRACT(DOW FROM (m."sentAt" AT TIME ZONE ${tz}))::int AS weekday,
      EXTRACT(HOUR FROM (m."sentAt" AT TIME ZONE ${tz}))::int AS hour,
      COUNT(*)::bigint AS sent,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM acq_replies r
          WHERE r."leadId" = l.id
            AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
        )
      )::bigint AS replied
    FROM acq_messages m
    JOIN acq_leads l ON l.id = m."leadId"
    WHERE m."stepIndex" = 0
      AND m.status IN ('SENT', 'SENT_MOCK', 'SENT_ASSISTED')
      AND m."sentAt" >= ${scope.from} AND m."sentAt" <= ${scope.to}
      AND ${lineMarketFilter(scope)}
    GROUP BY weekday, hour
  `;
  return rows.map((r) => ({
    weekday: r.weekday,
    hour: r.hour,
    sent: Number(r.sent),
    replied: Number(r.replied),
  }));
}
