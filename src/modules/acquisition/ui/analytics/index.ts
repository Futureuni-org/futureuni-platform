/**
 * Client UI for the analytics and overview screens (Phase 17). Server pages pass plain, already
 * computed props to these components. The `_seams.ts` stand-in (SEAM-LINE-CONTEXT) is repointed to
 * `@/modules/acquisition/ui/shell` at Wave 4 integration.
 */

export { resolveLine, lineHref, LINE_SLUGS, type LineContext } from "./_seams";
export { AnalyticsFilterBar } from "./filters/analytics-filter-bar";
export { InfoTooltip } from "./info-tooltip";
export { CsvExportButton } from "./csv/export-button";
export { FunnelChart } from "./charts/funnel-chart";
export { ConversionBars } from "./charts/conversion-bars";
export { HeatmapChart } from "./charts/heatmap-chart";
export { TrendChart, type TrendSeriesOption } from "./charts/trend-chart";
export { ComparisonBars, type ComparisonRow } from "./charts/comparison-bars";
export {
  formatByUnit,
  formatCount,
  formatCostUsd,
  formatDelta,
  formatDuration,
  formatPercent,
  formatScore,
  deltaIsGood,
} from "./format";
export { toCsv, csvCell } from "./csv";
