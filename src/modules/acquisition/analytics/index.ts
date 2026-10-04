/**
 * Public surface of the Client Acquisition analytics area (Phase 17). The app screens and the
 * integration session import from here. Database access stays in the `queries/*.repo.ts` files;
 * the services authorise and assemble.
 */

export {
  getLineAnalytics,
  getFunnel,
  getTimeSeries,
  getBreakdown,
  getReplyHeatmap,
  getResponsiveness,
  getEfficiency,
  getCalibration,
  getLossReasons,
  getStageConversion,
  getTimeInStageData,
  getOverview,
  LOW_SAMPLE_THRESHOLD,
  type EfficiencyResult,
} from "./service";

export { revalidateAnalytics } from "./cache";

// Registration surface for Phase 19 (jobs, tasks, settings, schedules, notification types).
export { analyticsTasks, registerAnalyticsTasks, weeklyInsightTask } from "./tasks";
export { analyticsJobs, weeklyReportJob } from "./jobs";
export { analyticsSchedules } from "./schedules";
export {
  analyticsSettings,
  ANALYTICS_SETTING_KEYS,
  getLowSampleThreshold,
  isWeeklyReportEnabled,
} from "./settings";
export { analyticsNotificationTypes, ANALYTICS_NOTIFICATION_TYPES } from "./notifications";

// Weekly insight (US-43).
export { buildWeeklyInsightInput } from "./insight/input";
export { generateWeeklyInsight, type GeneratedInsight } from "./insight/generate";
export { runWeeklyReport, type WeeklyReportResult } from "./insight/report";
export { checkInsightNumbers, allowedNumbers } from "./insight/number-check";
export {
  WeeklyInsightInputSchema,
  WeeklyInsightOutputSchema,
  type WeeklyInsightInput,
  type WeeklyInsightOutput,
} from "./insight/schema";

// Formatters (shared by the UI and the weekly-insight builder).
export {
  deltaIsGood,
  formatByUnit,
  formatCostUsd,
  formatCount,
  formatDelta,
  formatDuration,
  formatPercent,
  formatScore,
} from "./format";

export {
  METRICS,
  METRIC_IDS,
  getMetric,
  isMetricId,
  type MetricId,
  type MetricDefinition,
  type MetricUnit,
} from "./metrics";

export {
  PLATFORM_TIMEZONE,
  RANGE_PRESETS,
  resolveRange,
  previousPeriod,
  recipientTimezone,
  type RangePreset,
  type Granularity,
  type DateRange,
} from "./time";

export type {
  LineAnalyticsFilters,
  OverviewFilters,
  LineAnalytics,
  ScalarMetricValue,
  DurationMetricValue,
  RevenueByCurrencyRow,
  FunnelResult,
  FunnelStage,
  TimeSeriesResult,
  TimeSeriesPoint,
  BreakdownResult,
  BreakdownRow,
  BreakdownDimension,
  ReplyHeatmapResult,
  HeatmapCell,
  SlaByOwnerRow,
  CalibrationRow,
  OverviewResult,
  OverviewLineMetrics,
  OverviewCrossSellRow,
  OverviewMarketSplitRow,
  OverviewDeliverability,
  AiEfficiency,
} from "./types";
