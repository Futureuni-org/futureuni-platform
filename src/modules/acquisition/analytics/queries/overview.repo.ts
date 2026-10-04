/**
 * Cross-line aggregates for the overview tab (Phase 17), computed in a few grouped queries rather
 * than per-line round-trips. Revenue is grouped per line and currency and never summed across
 * currencies (INV-11). Reply rate uses the cohort (leads created in the range), matching the line
 * page. All Prisma access is here.
 */

import "server-only";

import type { Currency, Market, ServiceLine } from "@/contracts/common";
import { db, Prisma } from "@/platform/db";

export interface OverviewAggArgs {
  lines: ServiceLine[];
  market?: Market;
  from: Date;
  to: Date;
}

function lineIn(lines: ServiceLine[]): Prisma.Sql {
  return Prisma.join(lines.map((line) => Prisma.sql`CAST(${line} AS "ServiceLine")`));
}

function marketClause(market: Market | undefined, alias = "l"): Prisma.Sql {
  if (market === undefined) return Prisma.empty;
  const col = alias === "d" ? Prisma.sql`d."market"` : Prisma.sql`l."market"`;
  return Prisma.sql`AND ${col} = CAST(${market} AS "Market")`;
}

export interface LineCohortAgg {
  serviceLine: ServiceLine;
  leadsFound: number;
  contacted: number;
  replied: number;
  meetings: number;
  nurtureHeld: number;
}

export interface LineRevenueAgg {
  serviceLine: ServiceLine;
  currency: Currency;
  wonCount: number;
  revenueMinor: number;
}

export interface OverviewAggregates {
  cohort: LineCohortAgg[];
  revenue: LineRevenueAgg[];
}

/** Per-line leads/contacted/replied/meetings/nurture and per-line-per-currency revenue. */
export async function getOverviewAggregates(args: OverviewAggArgs): Promise<OverviewAggregates> {
  if (args.lines.length === 0) return { cohort: [], revenue: [] };
  const lines = lineIn(args.lines);
  const [cohortRows, meetingRows, nurtureRows, revenueRows] = await Promise.all([
    db.$queryRaw<{ line: ServiceLine; leads: bigint; contacted: bigint; replied: bigint }[]>`
      SELECT l."serviceLine" AS line,
        COUNT(*)::bigint AS leads,
        COUNT(*) FILTER (WHERE l."firstContactedAt" IS NOT NULL)::bigint AS contacted,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM acq_replies r WHERE r."leadId" = l.id
              AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
          )
        )::bigint AS replied
      FROM acq_leads l
      WHERE l."createdAt" >= ${args.from} AND l."createdAt" <= ${args.to}
        AND l."serviceLine" IN (${lines}) ${marketClause(args.market)}
      GROUP BY line
    `,
    db.$queryRaw<{ line: ServiceLine; n: bigint }[]>`
      SELECT l."serviceLine" AS line, COUNT(*)::bigint AS n
      FROM acq_meetings mt JOIN acq_leads l ON l.id = mt."leadId"
      WHERE mt."startsAt" >= ${args.from} AND mt."startsAt" <= ${args.to} AND mt.status <> 'UNMATCHED'
        AND l."serviceLine" IN (${lines}) ${marketClause(args.market)}
      GROUP BY line
    `,
    db.$queryRaw<{ line: ServiceLine; n: bigint }[]>`
      SELECT l."serviceLine" AS line, COUNT(*)::bigint AS n
      FROM acq_leads l
      WHERE l.status = 'NURTURE' AND l."serviceLine" IN (${lines}) ${marketClause(args.market)}
      GROUP BY line
    `,
    db.$queryRaw<{ line: ServiceLine; cur: Currency; won: bigint; total: bigint | null }[]>`
      SELECT d."serviceLine" AS line, d.currency AS cur, COUNT(*)::bigint AS won, SUM(d."valueMinor")::bigint AS total
      FROM acq_deals d
      WHERE d.outcome = 'WON' AND d."closedAt" >= ${args.from} AND d."closedAt" <= ${args.to}
        AND d."serviceLine" IN (${lines}) AND d.currency IS NOT NULL ${marketClause(args.market, "d")}
      GROUP BY line, cur
    `,
  ]);

  const meetingByLine = new Map(meetingRows.map((r) => [r.line, Number(r.n)]));
  const nurtureByLine = new Map(nurtureRows.map((r) => [r.line, Number(r.n)]));
  const cohort: LineCohortAgg[] = args.lines.map((serviceLine) => {
    const row = cohortRows.find((r) => r.line === serviceLine);
    return {
      serviceLine,
      leadsFound: Number(row?.leads ?? 0n),
      contacted: Number(row?.contacted ?? 0n),
      replied: Number(row?.replied ?? 0n),
      meetings: meetingByLine.get(serviceLine) ?? 0,
      nurtureHeld: nurtureByLine.get(serviceLine) ?? 0,
    };
  });
  const revenue: LineRevenueAgg[] = revenueRows.map((r) => ({
    serviceLine: r.line,
    currency: r.cur,
    wonCount: Number(r.won),
    revenueMinor: Number(r.total ?? 0n),
  }));
  return { cohort, revenue };
}

export interface MarketSplitAgg {
  market: Market;
  leadsFound: number;
  replied: number;
  won: number;
}

/** Leads/replied/won split by market across the given lines. */
export async function getMarketSplit(args: OverviewAggArgs): Promise<MarketSplitAgg[]> {
  if (args.lines.length === 0) return [];
  const lines = lineIn(args.lines);
  const [leadRows, wonRows] = await Promise.all([
    db.$queryRaw<{ market: Market; leads: bigint; replied: bigint }[]>`
      SELECT l."market" AS market,
        COUNT(*)::bigint AS leads,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM acq_replies r WHERE r."leadId" = l.id
              AND (r.classification IS NULL OR r.classification NOT IN ('OUT_OF_OFFICE', 'BOUNCE'))
          )
        )::bigint AS replied
      FROM acq_leads l
      WHERE l."createdAt" >= ${args.from} AND l."createdAt" <= ${args.to}
        AND l."serviceLine" IN (${lines})
      GROUP BY market
    `,
    db.$queryRaw<{ market: Market; won: bigint }[]>`
      SELECT d."market" AS market, COUNT(*)::bigint AS won
      FROM acq_deals d
      WHERE d.outcome = 'WON' AND d."closedAt" >= ${args.from} AND d."closedAt" <= ${args.to}
        AND d."serviceLine" IN (${lines})
      GROUP BY market
    `,
  ]);
  const wonByMarket = new Map(wonRows.map((r) => [r.market, Number(r.won)]));
  return leadRows.map((r) => ({
    market: r.market,
    leadsFound: Number(r.leads),
    replied: Number(r.replied),
    won: wonByMarket.get(r.market) ?? 0,
  }));
}

export interface LeadProposalTotal {
  leadId: string;
  currency: Currency;
  totalMinor: number;
}

/** The latest non-superseded proposal total for each lead, for cross-sell estimated value. */
export async function getLatestProposalTotals(leadIds: string[]): Promise<LeadProposalTotal[]> {
  if (leadIds.length === 0) return [];
  const rows = await db.$queryRaw<{ leadId: string; currency: Currency; total: number }[]>`
    SELECT DISTINCT ON (p."leadId") p."leadId" AS "leadId", p.currency AS currency, p."totalMinor" AS total
    FROM acq_proposals p
    WHERE p."leadId" IN (${Prisma.join(leadIds)}) AND p.status <> 'SUPERSEDED'
    ORDER BY p."leadId", p."createdAt" DESC
  `;
  return rows.map((r) => ({ leadId: r.leadId, currency: r.currency, totalMinor: r.total }));
}
