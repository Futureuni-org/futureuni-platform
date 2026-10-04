/**
 * Shared result types for the analytics data layer (Phase 17). These are the plain, serialisable
 * shapes the server computes and passes to the client components as props (no Prisma types cross
 * the boundary). Money is always per currency (INV-11); durations are milliseconds; costs are
 * micro-USD (ADR-027).
 */

import type { Currency, Market, ServiceLine } from "@/contracts/common";

import type { MetricId } from "./metrics";
import type { DateRange, Granularity } from "./time";

export type { DateRange, Granularity, RangePreset } from "./time";

/** Filters for a single line's analytics, resolved from the URL (module spec §6). */
export interface LineAnalyticsFilters {
  serviceLine: ServiceLine;
  /** Undefined means both markets. */
  market?: Market;
  from: Date;
  to: Date;
  /** Compare against the immediately preceding window of equal length. */
  compare: boolean;
  /** Adapter ids to restrict source-derived metrics to (optional). */
  sources?: string[];
  /** Restrict to one owner (optional). */
  ownerId?: string;
}

/** Filters for the cross-line overview. `lines` is already narrowed to what the viewer may see. */
export interface OverviewFilters {
  lines: ServiceLine[];
  market?: Market;
  from: Date;
  to: Date;
}

/**
 * A scalar metric with its comparison. `value` carries the natural unit: a count, a ratio in
 * `0..1` for percent metrics, milliseconds for durations, or micro-USD for costs. `delta` is the
 * signed relative change `(value − previous) ÷ previous`, null when there is no comparison or the
 * previous value is zero. `sparkline` is a short period series for the headline tiles.
 */
export interface ScalarMetricValue {
  id: MetricId;
  value: number | null;
  previous: number | null;
  delta: number | null;
  sparkline: number[];
}

/** A duration metric reported as median and 75th percentile, in milliseconds. */
export interface DurationMetricValue {
  id: MetricId;
  medianMs: number | null;
  p75Ms: number | null;
  previousMedianMs: number | null;
}

/** Won revenue for one currency, with its comparison. Never summed with another currency. */
export interface RevenueByCurrencyRow {
  currency: Currency;
  revenueMinor: number;
  wonCount: number;
  averageDealMinor: number;
  previousRevenueMinor: number;
  deltaRevenue: number | null;
}

/** Everything the line page's headline row and rate displays need in one call. */
export interface LineAnalytics {
  range: DateRange;
  compareRange: DateRange | null;
  /** Every single-valued metric, keyed by id. */
  scalars: Partial<Record<MetricId, ScalarMetricValue>>;
  /** Median/p75 duration metrics, keyed by id. */
  durations: Partial<Record<MetricId, DurationMetricValue>>;
  /** Won revenue and average deal size, per currency. */
  revenue: RevenueByCurrencyRow[];
}

// ---- Funnel ----------------------------------------------------------------

/** One cohort funnel stage with the conversion from the previous stage. */
export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Conversion from the previous stage, `0..1`; null for the first stage. */
  conversionFromPrevious: number | null;
  /** Drop-off from the previous stage (previous − count); null for the first stage. */
  dropOff: number | null;
}

export interface FunnelResult {
  stages: FunnelStage[];
  /** Per-market split (Nigeria, International), each a full stage list. */
  byMarket: { market: Market; stages: FunnelStage[] }[];
  /** The cohort size (leads created in the range). */
  cohortSize: number;
}

// ---- Time series -----------------------------------------------------------

export interface TimeSeriesPoint {
  /** ISO day/week/month bucket start (platform timezone). */
  bucket: string;
  values: Partial<Record<MetricId, number>>;
}

export interface TimeSeriesResult {
  granularity: Granularity;
  metricIds: MetricId[];
  points: TimeSeriesPoint[];
}

// ---- Breakdowns ------------------------------------------------------------

export type BreakdownDimension =
  | "market"
  | "country"
  | "source"
  | "signal"
  | "owner"
  | "channel"
  | "pitchAngle";

/** One row of a breakdown: a dimension value, its conversion metric and the sample size. */
export interface BreakdownRow {
  key: string;
  label: string;
  /** Leads (or sends) in this bucket — the sample size `n`. */
  sampleSize: number;
  /** The measured ratio for this row (`0..1`), e.g. reply rate or win rate. */
  rate: number | null;
  /** Raw numerator for the data-table view. */
  numerator: number;
  /** True when the sample is too small to trust (muted in the UI). */
  lowSample: boolean;
}

export interface BreakdownResult {
  dimension: BreakdownDimension;
  metricId: MetricId;
  rows: BreakdownRow[];
}

// ---- Reply heatmap ---------------------------------------------------------

/** One weekday × hour cell of the reply heatmap, in recipient local time. */
export interface HeatmapCell {
  weekday: number; // 0=Sun … 6=Sat
  hour: number; // 0-23
  sent: number;
  replied: number;
  /** replied ÷ sent, `0..1`; null when nothing was sent in the cell. */
  rate: number | null;
}

export interface ReplyHeatmapResult {
  cells: HeatmapCell[];
  totalSent: number;
  totalReplied: number;
}

// ---- Responsiveness (SLA) --------------------------------------------------

export interface SlaByOwnerRow {
  ownerId: string;
  ownerName: string;
  actionable: number;
  met: number;
  slaMetRate: number | null;
  medianFirstResponseMs: number | null;
}

// ---- Efficiency (cost) -----------------------------------------------------

export interface CostPerSourceRow {
  adapterId: string;
  leads: number;
  /** Source + AI cost attributable to the source's leads, micro-USD. */
  costMicros: number;
  costPerLeadMicros: number | null;
}

export interface AiCostByTaskRow {
  task: string;
  calls: number;
  costMicros: number;
}

export interface AiEfficiency {
  aiCostPerWonDealMicros: number | null;
  wonCount: number;
  totalAiCostMicros: number;
  byTask: AiCostByTaskRow[];
}

// ---- Score calibration -----------------------------------------------------

export interface CalibrationRow {
  band: "QUALIFIED" | "BORDERLINE" | "BELOW";
  scored: number;
  replyRate: number | null;
  meetingRate: number | null;
  winRate: number | null;
}

// ---- Overview --------------------------------------------------------------

export interface OverviewLineMetrics {
  serviceLine: ServiceLine;
  leadsFound: number;
  replyRate: number | null;
  meetingsBooked: number;
  won: number;
  revenue: RevenueByCurrencyRow[];
  aiCostPerWonDealMicros: number | null;
  throttleMode: "NORMAL" | "SLOW" | "PAUSED";
  capacity: number;
  load: number;
  nurtureHeld: number;
}

export interface OverviewCrossSellRow {
  groupId: string;
  companyId: string;
  companyName: string;
  lines: ServiceLine[];
  leadingLine: ServiceLine | null;
  leadingLeadId: string | null;
  status: string;
  estimatedValue: { currency: Currency; amountMinor: number }[];
}

export interface OverviewMarketSplitRow {
  market: Market;
  leadsFound: number;
  replyRate: number | null;
  won: number;
}

export interface OverviewDeliverability {
  activeMailboxes: number;
  pausedMailboxes: number;
  warmingMailboxes: number;
  /** Hard-bounce rate across sampled mailboxes, `0..1`. */
  hardBounceRate: number | null;
}

export interface OverviewResult {
  range: DateRange;
  lines: OverviewLineMetrics[];
  crossSell: OverviewCrossSellRow[];
  marketSplit: OverviewMarketSplitRow[];
  ai: AiEfficiency & { byLine: { serviceLine: ServiceLine; costMicros: number }[] };
  deliverability: OverviewDeliverability;
}
