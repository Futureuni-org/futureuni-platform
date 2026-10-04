/**
 * Public analytics services for the Client Acquisition module (Phase 17; API-A47). Every entry
 * point authorises the line-scoped action first (mirroring the pipeline revenue services), then
 * reads from the cached pure aggregations and the reused pipeline/scoring/cross-sell services, and
 * returns plain, serialisable results. Money is always per currency (INV-11); cohort views follow
 * leads created in the range, period views count events in the range (INV-12 bucketing lives in the
 * repos and `time.ts`).
 */

import "server-only";

import type { Actor, Currency, Market, ServiceLine } from "@/contracts/common";
import { assertActorCan } from "@/platform/auth";
import { listCrossSellOpportunities } from "@/modules/acquisition/crosssell";
import {
  getMeetingStats,
  getRevenueSummary,
  getLossReasons as pipelineLossReasons,
  getStageConversion as pipelineStageConversion,
} from "@/modules/acquisition/pipeline";
import { getScoreCalibrationData, getThrottleStatus } from "@/modules/acquisition/scoring";
import { getLineCapacity } from "@/platform/team";

import { cacheAnalytics } from "./cache";
import {
  buildRevenueRows,
  delta,
  funnelStages,
  humanizeKey,
  isLowSample,
  ratio,
  scalarValues,
  type LineRaw,
} from "./compute";
import { getBreakdownCounts } from "./queries/breakdown.repo";
import {
  getAiCostByLine,
  getAiCostByTask,
  getAiCostOfWonLeads,
  getCostPerSource,
  getLineCostInputs,
} from "./queries/cost.repo";
import { getTimeInStage, getTimeToFirstReply } from "./queries/durations.repo";
import { getCohortStageCounts, type CohortScope } from "./queries/funnel.repo";
import { getReplyHeatmapCounts } from "./queries/heatmap.repo";
import { getMailboxSnapshot } from "./queries/mailbox.repo";
import {
  getLatestProposalTotals,
  getMarketSplit,
  getOverviewAggregates,
} from "./queries/overview.repo";
import {
  getApprovalCounts,
  getAverageScore,
  getCohortRateCounts,
  getProposalCounts,
  getSentCount,
} from "./queries/rates.repo";
import { getSlaByOwner, getSlaOverall } from "./queries/sla.repo";
import { getTrendSeries } from "./queries/time-series.repo";
import { getUserNames, getCompanyNames } from "./queries/users.repo";
import { METRICS, type MetricId } from "./metrics";
import { previousPeriod, type Granularity } from "./time";
import type {
  BreakdownDimension,
  BreakdownResult,
  CalibrationRow,
  DurationMetricValue,
  FunnelResult,
  LineAnalytics,
  LineAnalyticsFilters,
  OverviewFilters,
  OverviewResult,
  ReplyHeatmapResult,
  RevenueByCurrencyRow,
  ScalarMetricValue,
  SlaByOwnerRow,
  TimeSeriesResult,
} from "./types";

const DAY_MS = 86_400_000;

function toScope(filters: LineAnalyticsFilters): CohortScope {
  return {
    serviceLine: filters.serviceLine,
    ...(filters.market === undefined ? {} : { market: filters.market }),
    ...(filters.ownerId === undefined ? {} : { ownerId: filters.ownerId }),
    from: filters.from,
    to: filters.to,
  };
}

interface PipelineFilters {
  serviceLine?: ServiceLine;
  market?: Market;
  from: Date;
  to: Date;
}

function toPipelineFilters(scope: CohortScope): PipelineFilters {
  return {
    serviceLine: scope.serviceLine,
    ...(scope.market === undefined ? {} : { market: scope.market }),
    from: scope.from,
    to: scope.to,
  };
}

async function authorizeLine(actor: Actor, serviceLine: ServiceLine): Promise<void> {
  await assertActorCan(actor, "acquisition.analytics.read", { serviceLine });
}

// ---- Cached pure aggregations (keyed by the serialisable scope) -------------

const cohortStageCounts = cacheAnalytics(["cohort-stage"], getCohortStageCounts);
const cohortRateCounts = cacheAnalytics(["cohort-rates"], getCohortRateCounts);
const sentCount = cacheAnalytics(["sent"], getSentCount);
const approvalCounts = cacheAnalytics(["approvals"], getApprovalCounts);
const averageScore = cacheAnalytics(["avg-score"], getAverageScore);
const proposalCounts = cacheAnalytics(["proposals"], getProposalCounts);
const timeToFirstReply = cacheAnalytics(["ttfr"], getTimeToFirstReply);
const slaOverall = cacheAnalytics(["sla-overall"], getSlaOverall);
const lineCostInputs = cacheAnalytics(["cost-inputs"], getLineCostInputs);
const aiCostOfWonLeads = cacheAnalytics(["ai-cost-won"], getAiCostOfWonLeads);
const trendSeries = cacheAnalytics(["trend"], getTrendSeries);
const breakdownCounts = cacheAnalytics(["breakdown"], getBreakdownCounts);
const replyHeatmapCounts = cacheAnalytics(["heatmap"], getReplyHeatmapCounts);
const slaByOwner = cacheAnalytics(["sla-owner"], getSlaByOwner);
const costPerSource = cacheAnalytics(["cost-source"], getCostPerSource);
const aiCostByTask = cacheAnalytics(["ai-cost-task"], getAiCostByTask);
const timeInStage = cacheAnalytics(["time-in-stage"], getTimeInStage);
const overviewAggregates = cacheAnalytics(["overview-agg"], getOverviewAggregates);
const marketSplit = cacheAnalytics(["market-split"], getMarketSplit);
const aiCostByLine = cacheAnalytics(["ai-cost-line"], getAiCostByLine);
const mailboxSnapshot = cacheAnalytics(["mailbox"], getMailboxSnapshot);

// ---- Scalar metric assembly ------------------------------------------------

type LineRawWithSla = LineRaw & { slaMedianMs: number | null };

async function gatherLineRaw(scope: CohortScope): Promise<LineRawWithSla> {
  const [stage, rates, sent, approvals, avg, proposals, sla, cost, aiWon] = await Promise.all([
    cohortStageCounts(scope),
    cohortRateCounts(scope),
    sentCount(scope),
    approvalCounts(scope),
    averageScore(scope),
    proposalCounts(scope),
    slaOverall(scope),
    lineCostInputs(scope),
    aiCostOfWonLeads(scope),
  ]);
  return {
    slaMedianMs: sla.medianMs,
    found: stage.found,
    enriched: stage.byStage.enriched ?? 0,
    audited: stage.byStage.audited ?? 0,
    scored: stage.byStage.scored ?? 0,
    positive: stage.positive,
    contacted: rates.contacted,
    replied: rates.replied,
    unsubscribed: rates.unsubscribed,
    bounced: rates.bounced,
    sent,
    reviewed: approvals.reviewed,
    approved: approvals.approved,
    avgScore: avg,
    proposalsSent: proposals.sent,
    proposalsAccepted: proposals.accepted,
    slaActionable: sla.actionable,
    slaMet: sla.met,
    sourceCostMicros: cost.sourceCostMicros,
    aiCostMicros: cost.aiCostMicros,
    auditCostMicros: cost.auditCostMicros,
    aiCostOfWonMicros: aiWon,
  };
}

/** Metrics shown as sparkline-bearing headline tiles, mapped to their day-trend series. */
const SPARKLINE_SERIES: Partial<Record<MetricId, "leads_found" | "sent" | "reply_rate" | "meetings_booked">> =
  {
    leads_found: "leads_found",
    sent: "sent",
    reply_rate: "reply_rate",
    meetings_booked: "meetings_booked",
  };

// ---- getLineAnalytics ------------------------------------------------------

export async function getLineAnalytics(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<LineAnalytics> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const pf = toPipelineFilters(scope);
  const compareRange = filters.compare ? previousPeriod({ from: scope.from, to: scope.to }) : null;

  // Current and previous windows (and the trend and time-to-first-reply) fire in one batch, so the
  // compare path doesn't double the wall-clock time.
  const prevScope: CohortScope | null =
    compareRange === null ? null : { ...scope, from: compareRange.from, to: compareRange.to };
  const prevPf = prevScope === null ? null : toPipelineFilters(prevScope);
  const [raw, rev, mtg, trend, ttfr, prevRaw, prevRev, prevMtg] = await Promise.all([
    gatherLineRaw(scope),
    getRevenueSummary(actor, pf),
    getMeetingStats(actor, pf),
    trendSeries(scope, "day"),
    timeToFirstReply(scope),
    prevScope === null ? Promise.resolve(null) : gatherLineRaw(prevScope),
    prevPf === null ? Promise.resolve(null) : getRevenueSummary(actor, prevPf),
    prevPf === null ? Promise.resolve(null) : getMeetingStats(actor, prevPf),
  ]);

  const cur = scalarValues(raw, {
    wonCount: rev.wonCount,
    meetingsBooked: mtg.booked,
    noShowRate: mtg.noShowRate,
  });
  const prev =
    prevRaw === null || prevRev === null || prevMtg === null
      ? null
      : scalarValues(prevRaw, {
          wonCount: prevRev.wonCount,
          meetingsBooked: prevMtg.booked,
          noShowRate: prevMtg.noShowRate,
        });

  const buckets = sortedBuckets(trend);
  const scalars: Partial<Record<MetricId, ScalarMetricValue>> = {};
  for (const id of Object.keys(cur) as MetricId[]) {
    const value = cur[id] ?? null;
    const previous = prev?.[id] ?? null;
    const seriesKey = SPARKLINE_SERIES[id];
    scalars[id] = {
      id,
      value,
      previous,
      delta: delta(value, previous),
      sparkline: seriesKey === undefined ? [] : buckets.map((b) => trend[seriesKey].get(b) ?? 0),
    };
  }

  const durations: Partial<Record<MetricId, DurationMetricValue>> = {};
  durations.time_to_first_reply = {
    id: "time_to_first_reply",
    medianMs: ttfr.medianMs,
    p75Ms: ttfr.p75Ms,
    previousMedianMs: null,
  };
  durations.time_to_close = {
    id: "time_to_close",
    medianMs: rev.timeToCloseDays.median === null ? null : rev.timeToCloseDays.median * DAY_MS,
    p75Ms: rev.timeToCloseDays.p75 === null ? null : rev.timeToCloseDays.p75 * DAY_MS,
    previousMedianMs:
      prevRev?.timeToCloseDays.median == null ? null : prevRev.timeToCloseDays.median * DAY_MS,
  };
  durations.median_first_response_time = {
    id: "median_first_response_time",
    medianMs: raw.slaActionable === 0 ? null : raw.slaMedianMs,
    p75Ms: null,
    previousMedianMs: null,
  };

  const revenue = buildRevenueRows(rev.byCurrency, prevRev?.byCurrency ?? null);

  return {
    range: { from: scope.from, to: scope.to },
    compareRange,
    scalars,
    durations,
    revenue,
  };
}

function sortedBuckets(trend: Record<string, Map<string, number>>): string[] {
  const all = new Set<string>();
  for (const map of Object.values(trend)) for (const key of map.keys()) all.add(key);
  return [...all].sort();
}

// ---- getFunnel -------------------------------------------------------------

export async function getFunnel(actor: Actor, filters: LineAnalyticsFilters): Promise<FunnelResult> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const markets: Market[] = ["NIGERIA", "INTERNATIONAL"];
  const [combined, ...perMarket] = await Promise.all([
    cohortStageCounts(scope),
    ...markets.map((market) => cohortStageCounts({ ...scope, market })),
  ]);
  return {
    stages: funnelStages(combined),
    cohortSize: combined.found,
    byMarket: markets.map((market, index) => ({
      market,
      stages: funnelStages(perMarket[index] ?? { found: 0, byStage: {}, positive: 0 }),
    })),
  };
}

// ---- getTimeSeries ---------------------------------------------------------

const TREND_METRIC_IDS: MetricId[] = ["leads_found", "sent", "reply_rate", "meetings_booked"];

export async function getTimeSeries(
  actor: Actor,
  filters: LineAnalyticsFilters,
  granularity: Granularity,
  metricIds: MetricId[] = TREND_METRIC_IDS,
): Promise<TimeSeriesResult> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const trend = await trendSeries(scope, granularity);
  const wanted = metricIds.filter((id): id is (typeof TREND_METRIC_IDS)[number] =>
    (TREND_METRIC_IDS as string[]).includes(id),
  );
  const buckets = sortedBuckets(trend);
  return {
    granularity,
    metricIds: wanted,
    points: buckets.map((bucket) => ({
      bucket,
      values: Object.fromEntries(
        wanted.map((id) => [id, trend[id as keyof typeof trend].get(bucket) ?? 0]),
      ),
    })),
  };
}

// ---- getBreakdown ----------------------------------------------------------

export async function getBreakdown(
  actor: Actor,
  filters: LineAnalyticsFilters,
  dimension: BreakdownDimension,
): Promise<BreakdownResult> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const rows = await breakdownCounts(scope, dimension);
  const names =
    dimension === "owner"
      ? await getUserNames(rows.map((r) => r.key).filter((k) => k !== "(unassigned)"))
      : new Map<string, string>();
  return {
    dimension,
    metricId: "reply_rate",
    rows: rows.map((r) => ({
      key: r.key,
      label:
        dimension === "owner"
          ? r.key === "(unassigned)"
            ? "Unassigned"
            : (names.get(r.key) ?? "Unknown")
          : humanizeKey(dimension, r.key),
      sampleSize: r.sample,
      numerator: r.numerator,
      rate: ratio(r.numerator, r.sample),
      lowSample: isLowSample(r.sample),
    })),
  };
}

// ---- getReplyHeatmap -------------------------------------------------------

export async function getReplyHeatmap(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<ReplyHeatmapResult> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const cells = await replyHeatmapCounts(scope);
  let totalSent = 0;
  let totalReplied = 0;
  for (const c of cells) {
    totalSent += c.sent;
    totalReplied += c.replied;
  }
  return {
    cells: cells.map((c) => ({ ...c, rate: ratio(c.replied, c.sent) })),
    totalSent,
    totalReplied,
  };
}

// ---- Responsiveness, efficiency, calibration, loss, stage, time-in-stage ---

export async function getResponsiveness(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<SlaByOwnerRow[]> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const rows = await slaByOwner(scope);
  const names = await getUserNames(rows.map((r) => r.ownerId).filter((k) => k !== "(unassigned)"));
  return rows.map((r) => ({
    ownerId: r.ownerId,
    ownerName: r.ownerId === "(unassigned)" ? "Unassigned" : (names.get(r.ownerId) ?? "Unknown"),
    actionable: r.actionable,
    met: r.met,
    slaMetRate: ratio(r.met, r.actionable),
    medianFirstResponseMs: r.medianMs,
  }));
}

export interface EfficiencyResult {
  costPerSource: { adapterId: string; leads: number; aiCostMicros: number; aiCostPerLeadMicros: number | null }[];
  aiCostPerWonDealMicros: number | null;
  totalAiCostMicros: number;
  byTask: { task: string; calls: number; costMicros: number }[];
}

export async function getEfficiency(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<EfficiencyResult> {
  await authorizeLine(actor, filters.serviceLine);
  const scope = toScope(filters);
  const pf = toPipelineFilters(scope);
  const [sources, byTask, aiWon, rev, costInputs] = await Promise.all([
    costPerSource(scope),
    aiCostByTask(scope, 5),
    aiCostOfWonLeads(scope),
    getRevenueSummary(actor, pf),
    lineCostInputs(scope),
  ]);
  return {
    costPerSource: sources.map((s) => ({
      adapterId: s.adapterId,
      leads: s.leads,
      aiCostMicros: s.aiCostMicros,
      aiCostPerLeadMicros: ratio(s.aiCostMicros, s.leads),
    })),
    aiCostPerWonDealMicros: ratio(aiWon, rev.wonCount),
    totalAiCostMicros: costInputs.aiCostMicros,
    byTask,
  };
}

export async function getCalibration(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<CalibrationRow[]> {
  await authorizeLine(actor, filters.serviceLine);
  const data = await getScoreCalibrationData({
    line: filters.serviceLine,
    from: filters.from,
    to: filters.to,
  });
  return data.buckets.map((b) => ({
    band: b.band,
    scored: b.scored,
    replyRate: ratio(b.replied, b.scored),
    meetingRate: ratio(b.meeting, b.scored),
    winRate: ratio(b.won, b.scored),
  }));
}

export async function getLossReasons(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<{ reason: string; count: number }[]> {
  await authorizeLine(actor, filters.serviceLine);
  return pipelineLossReasons(actor, toPipelineFilters(toScope(filters)));
}

export async function getStageConversion(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<{ from: string; to: string; count: number }[]> {
  await authorizeLine(actor, filters.serviceLine);
  return pipelineStageConversion(actor, toPipelineFilters(toScope(filters)));
}

export async function getTimeInStageData(
  actor: Actor,
  filters: LineAnalyticsFilters,
): Promise<{ stage: string; medianMs: number | null }[]> {
  await authorizeLine(actor, filters.serviceLine);
  return timeInStage(toScope(filters));
}

// ---- getOverview -----------------------------------------------------------

export async function getOverview(actor: Actor, filters: OverviewFilters): Promise<OverviewResult> {
  for (const line of filters.lines) {
    await assertActorCan(actor, "acquisition.overview.read", { serviceLine: line });
  }
  if (filters.lines.length === 0) {
    return {
      range: { from: filters.from, to: filters.to },
      lines: [],
      crossSell: [],
      marketSplit: [],
      ai: { aiCostPerWonDealMicros: null, wonCount: 0, totalAiCostMicros: 0, byTask: [], byLine: [] },
      deliverability: { activeMailboxes: 0, pausedMailboxes: 0, warmingMailboxes: 0, hardBounceRate: null },
    };
  }

  const aggArgs = {
    lines: filters.lines,
    ...(filters.market === undefined ? {} : { market: filters.market }),
    from: filters.from,
    to: filters.to,
  };
  const [agg, split, throttle, aiLine, crossSell, mailbox] = await Promise.all([
    overviewAggregates(aggArgs),
    marketSplit(aggArgs),
    // The overview must render even if a line is mid-setup without an active profile, so a missing
    // throttle reading falls back to NORMAL rather than failing the whole dashboard.
    getThrottleStatus().catch(() => [] as Awaited<ReturnType<typeof getThrottleStatus>>),
    aiCostByLine(aggArgs),
    listCrossSellOpportunities({ from: filters.from, to: filters.to, lines: filters.lines }),
    mailboxSnapshot(filters.from, filters.to),
  ]);

  const capacities = await Promise.all(filters.lines.map((line) => getLineCapacity(line)));
  const capacityByLine = new Map(capacities.map((c) => [c.serviceLine, c]));
  const throttleByLine = new Map(throttle.map((t) => [t.line, t]));
  const aiByLine = new Map(aiLine.map((a) => [a.serviceLine, a.costMicros]));

  // Per-line AI cost per won deal needs each line's won AI cost and won count.
  const revenueByLine = new Map<ServiceLine, RevenueByCurrencyRow[]>();
  for (const line of filters.lines) {
    revenueByLine.set(
      line,
      agg.revenue
        .filter((r) => r.serviceLine === line)
        .map((r) => ({
          currency: r.currency,
          revenueMinor: r.revenueMinor,
          wonCount: r.wonCount,
          averageDealMinor: r.wonCount === 0 ? 0 : Math.round(r.revenueMinor / r.wonCount),
          previousRevenueMinor: 0,
          deltaRevenue: null,
        })),
    );
  }

  const lines = filters.lines.map((serviceLine) => {
    const cohort = agg.cohort.find((c) => c.serviceLine === serviceLine);
    const capacity = capacityByLine.get(serviceLine);
    const wonForLine = (revenueByLine.get(serviceLine) ?? []).reduce((s, r) => s + r.wonCount, 0);
    return {
      serviceLine,
      leadsFound: cohort?.leadsFound ?? 0,
      replyRate: ratio(cohort?.replied ?? 0, cohort?.contacted ?? 0),
      meetingsBooked: cohort?.meetings ?? 0,
      won: wonForLine,
      revenue: revenueByLine.get(serviceLine) ?? [],
      aiCostPerWonDealMicros: ratio(aiByLine.get(serviceLine) ?? 0, wonForLine),
      throttleMode: throttleByLine.get(serviceLine)?.mode ?? "NORMAL",
      capacity: capacity?.capacity ?? 0,
      load: capacity?.load ?? 0,
      nurtureHeld: cohort?.nurtureHeld ?? 0,
    };
  });

  const crossSellRows = await buildCrossSellRows(crossSell);

  const totalAiCost = aiLine.reduce((s, a) => s + a.costMicros, 0);
  return {
    range: { from: filters.from, to: filters.to },
    lines,
    crossSell: crossSellRows,
    marketSplit: split.map((s) => ({
      market: s.market,
      leadsFound: s.leadsFound,
      replyRate: ratio(s.replied, s.leadsFound),
      won: s.won,
    })),
    ai: {
      aiCostPerWonDealMicros: null,
      wonCount: lines.reduce((s, l) => s + l.won, 0),
      totalAiCostMicros: totalAiCost,
      byTask: [],
      byLine: aiLine.map((a) => ({ serviceLine: a.serviceLine, costMicros: a.costMicros })),
    },
    deliverability: {
      activeMailboxes: mailbox.activeMailboxes,
      pausedMailboxes: mailbox.pausedMailboxes,
      warmingMailboxes: mailbox.warmingMailboxes,
      hardBounceRate: mailbox.hardBounceRate,
    },
  };
}

async function buildCrossSellRows(
  groups: Awaited<ReturnType<typeof listCrossSellOpportunities>>,
): Promise<OverviewResult["crossSell"]> {
  const companyNames = await getCompanyNames(groups.map((g) => g.companyId));
  const allLeadIds = groups.flatMap((g) => g.leads.map((l) => l.id));
  const proposalTotals = await getLatestProposalTotals(allLeadIds);
  const totalByLead = new Map(proposalTotals.map((p) => [p.leadId, p]));
  return groups.map((g) => {
    const valueByCurrency = new Map<Currency, number>();
    for (const lead of g.leads) {
      const total = totalByLead.get(lead.id);
      if (total === undefined) continue;
      valueByCurrency.set(total.currency, (valueByCurrency.get(total.currency) ?? 0) + total.totalMinor);
    }
    const leadingLine = g.leads.find((l) => l.isLeading)?.serviceLine ?? null;
    return {
      groupId: g.groupId,
      companyId: g.companyId,
      companyName: companyNames.get(g.companyId) ?? "Unknown company",
      lines: g.lines,
      leadingLine,
      leadingLeadId: g.leadingLeadId,
      status: "ACTIVE",
      estimatedValue: [...valueByCurrency.entries()].map(([currency, amountMinor]) => ({
        currency,
        amountMinor,
      })),
    };
  });
}

/** The metric registry, re-exported so UI tooltips import from one analytics surface. */
export { METRICS };
export { LOW_SAMPLE_THRESHOLD } from "./compute";
