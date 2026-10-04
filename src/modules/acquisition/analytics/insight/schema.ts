/**
 * Schemas for the weekly "what changed" insight AI task (module spec §3.14, US-43). The input is a
 * compact snapshot of this week against last week, per line and market, with metric ids and sample
 * sizes and pre-formatted display strings (the only numbers the model may use). The output cites
 * metric ids and uses cautious language on small samples; it must not claim causes as facts.
 */

import { z } from "zod";

import { MarketSchema, ServiceLineSchema } from "@/contracts/common";

export const InsightMetricSchema = z.object({
  /** Metric id, used as the citation token. */
  id: z.string(),
  label: z.string(),
  /** The value this week, already formatted for display (e.g. "25%", "₦500,000", "3.2 days"). */
  current: z.string(),
  /** The value last week, already formatted. */
  previous: z.string(),
  /** The sample size behind the current value, so the model can hedge on small samples. */
  sampleSize: z.number().int().nonnegative(),
});

export const InsightCellSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  metrics: z.array(InsightMetricSchema).max(30),
});

export const WeeklyInsightInputSchema = z.object({
  weekLabel: z.string(),
  previousWeekLabel: z.string(),
  cells: z.array(InsightCellSchema).max(16),
});
export type WeeklyInsightInput = z.infer<typeof WeeklyInsightInputSchema>;

const InsightPointSchema = z.object({
  text: z.string().min(1).max(400),
  metricIds: z.array(z.string()).max(8),
});

export const WeeklyInsightOutputSchema = z.object({
  headline: z.string().min(1).max(200),
  points: z.array(InsightPointSchema).max(6),
  watchouts: z.array(InsightPointSchema).max(6),
});
export type WeeklyInsightOutput = z.infer<typeof WeeklyInsightOutputSchema>;
