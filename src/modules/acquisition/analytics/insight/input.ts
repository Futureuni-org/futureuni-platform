/**
 * Builds the compact weekly-insight input (US-43): this week against last week, per line and
 * market, with metric ids, sample sizes and pre-formatted display strings. The display strings are
 * the only numbers the model may use (enforced by the number-check). Every value comes from the
 * authorised analytics service, so the job's SYSTEM actor must be allowed `acquisition.analytics.read`.
 */

import "server-only";

import type { Actor, Market, ServiceLine } from "@/contracts/common";
import { formatMoney } from "@/lib/money";

import type { z } from "zod";

import { getLineAnalytics } from "../service";
import { formatCount, formatPercent } from "../format";
import type { LineAnalytics } from "../types";
import type { MetricId } from "../metrics";
import type { InsightMetricSchema, WeeklyInsightInput } from "./schema";

type InsightMetric = z.infer<typeof InsightMetricSchema>;

const WEEK_MS = 7 * 86_400_000;
const MARKETS: Market[] = ["NIGERIA", "INTERNATIONAL"];
/** The count/rate metrics summarised each week (revenue is added per currency below). */
const SUMMARY_METRICS: MetricId[] = [
  "leads_found",
  "reply_rate",
  "positive_reply_rate",
  "meetings_booked",
  "won",
];

function weekLabel(end: Date): string {
  const start = new Date(end.getTime() - WEEK_MS);
  return `week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(start)}`;
}

function displayFor(id: MetricId, data: LineAnalytics, which: "value" | "previous"): string {
  const scalar = data.scalars[id];
  const raw = scalar === undefined ? null : scalar[which];
  if (id === "reply_rate" || id === "positive_reply_rate") return formatPercent(raw);
  return formatCount(raw);
}

function cellMetrics(data: LineAnalytics): InsightMetric[] {
  const sampleSize = data.scalars.leads_found?.value ?? 0;
  const metrics: InsightMetric[] = SUMMARY_METRICS.map((id) => ({
    id,
    label: id,
    current: displayFor(id, data, "value"),
    previous: displayFor(id, data, "previous"),
    sampleSize,
  }));
  for (const row of data.revenue) {
    metrics.push({
      id: "revenue",
      label: `revenue_${row.currency}`,
      current: formatMoney({ amountMinor: row.revenueMinor, currency: row.currency }),
      previous: formatMoney({ amountMinor: row.previousRevenueMinor, currency: row.currency }),
      sampleSize: row.wonCount,
    });
  }
  return metrics;
}

export async function buildWeeklyInsightInput(
  actor: Actor,
  args: { lines: ServiceLine[]; now: Date },
): Promise<WeeklyInsightInput> {
  const to = args.now;
  const from = new Date(to.getTime() - WEEK_MS);
  const cells: WeeklyInsightInput["cells"] = [];
  for (const serviceLine of args.lines) {
    for (const market of MARKETS) {
      const data = await getLineAnalytics(actor, { serviceLine, market, from, to, compare: true });
      cells.push({ serviceLine, market, metrics: cellMetrics(data) });
    }
  }
  return {
    weekLabel: weekLabel(to),
    previousWeekLabel: weekLabel(from),
    cells,
  };
}
