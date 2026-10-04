/**
 * Formatting for analytics values (Phase 17). Pure and dependency-free (usable on the server, e.g.
 * the weekly-insight input builder, and on the client). Numbers always go through
 * `Intl.NumberFormat` (project-rules §Output). Ratios are `0..1`; durations are milliseconds; costs
 * are micro-USD (ADR-027, internal — never client money, which uses the `Money` component). An em
 * dash marks a value that doesn't exist (a rate with no denominator).
 */

import type { MetricDefinition } from "./metrics";

const EN = "en-GB";
const EM_DASH = "—";

const integerFormat = new Intl.NumberFormat(EN, { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat(EN, { style: "percent", maximumFractionDigits: 1 });
const scoreFormat = new Intl.NumberFormat(EN, { maximumFractionDigits: 1 });
const usdFormat = new Intl.NumberFormat(EN, { style: "currency", currency: "USD" });

export function formatCount(value: number | null): string {
  return value === null ? EM_DASH : integerFormat.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? EM_DASH : percentFormat.format(value);
}

export function formatScore(value: number | null): string {
  return value === null ? EM_DASH : scoreFormat.format(value);
}

/** Micro-USD → "$1.23". */
export function formatCostUsd(micros: number | null): string {
  return micros === null ? EM_DASH : usdFormat.format(micros / 1_000_000);
}

/** Milliseconds → a compact human duration: minutes under an hour, hours under two days, else days. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return EM_DASH;
  const minutes = ms / 60_000;
  if (minutes < 60) return `${integerFormat.format(Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${scoreFormat.format(hours)}h`;
  return `${scoreFormat.format(hours / 24)} days`;
}

/** A signed relative change as "+12%" / "−8%" (true minus sign), em dash when absent. */
export function formatDelta(delta: number | null): string {
  if (delta === null) return EM_DASH;
  const pct = percentFormat.format(Math.abs(delta));
  if (delta === 0) return pct;
  return delta > 0 ? `+${pct}` : `−${pct}`;
}

/**
 * Whether a delta is an improvement, given the metric's direction. Used to colour a delta chip by
 * meaning, not by sign (a falling bounce rate is good).
 */
export function deltaIsGood(delta: number | null, higherIsBetter: boolean | null): boolean | undefined {
  if (delta === null || delta === 0 || higherIsBetter === null) return undefined;
  return higherIsBetter ? delta > 0 : delta < 0;
}

/** Formats a scalar metric value by its unit (money is rendered with the `Money` component instead). */
export function formatByUnit(unit: MetricDefinition["unit"], value: number | null): string {
  switch (unit) {
    case "percent":
      return formatPercent(value);
    case "duration":
      return formatDuration(value);
    case "cost":
      return formatCostUsd(value);
    case "count":
    case "money":
      return formatCount(value);
  }
}
