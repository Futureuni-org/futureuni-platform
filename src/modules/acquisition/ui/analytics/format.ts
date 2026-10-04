/**
 * Re-exports the analytics formatters (Phase 17). The implementations live in the analytics module
 * (`@/modules/acquisition/analytics/format`) so the server-side weekly-insight builder and these
 * client components share one source of truth.
 */

export {
  deltaIsGood,
  formatByUnit,
  formatCostUsd,
  formatCount,
  formatDelta,
  formatDuration,
  formatPercent,
  formatScore,
} from "@/modules/acquisition/analytics/format";
