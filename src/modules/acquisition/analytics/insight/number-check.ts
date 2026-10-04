/**
 * Number-consistency check for the weekly insight (US-43 AC-43.1: every number in the insight must
 * equal an input value). The same approach as the Phase 14 proposal check: parse every numeric
 * token out of the model's prose and reject any that isn't one of the allowed display values. The
 * allowed set is built from the input's formatted display strings, sample sizes and week labels, so
 * the model may only restate numbers it was given — never compute or round a new one.
 */

import type { WeeklyInsightInput, WeeklyInsightOutput } from "./schema";

/** A numeric token: optional currency symbol, digits with grouping, optional decimals, optional %. */
const NUMBER_RE = /[₦$£€]?\s?\d[\d,]*(?:\.\d+)?\s?%?/g;

/** Strips grouping and spaces so "₦500,000" and "₦500 000" compare equal; keeps symbol, dot and %. */
function normalise(token: string): string {
  return token.replace(/[\s,]/g, "");
}

function extract(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(normalise).filter((t) => /\d/.test(t));
}

/** Builds the set of every number the insight is allowed to state, from the input. */
export function allowedNumbers(input: WeeklyInsightInput): Set<string> {
  const allowed = new Set<string>();
  const add = (s: string): void => {
    for (const token of extract(s)) allowed.add(token);
  };
  add(input.weekLabel);
  add(input.previousWeekLabel);
  for (const cell of input.cells) {
    for (const metric of cell.metrics) {
      add(metric.current);
      add(metric.previous);
      allowed.add(normalise(String(metric.sampleSize)));
    }
  }
  return allowed;
}

export interface InsightNumberCheckResult {
  ok: boolean;
  /** The numeric tokens found in the text that weren't in the allowed set. */
  mismatches: string[];
}

/** Scans the whole insight (headline, points, watchouts) for numbers outside the allowed set. */
export function checkInsightNumbers(
  output: WeeklyInsightOutput,
  input: WeeklyInsightInput,
): InsightNumberCheckResult {
  const allowed = allowedNumbers(input);
  const texts = [output.headline, ...output.points.map((p) => p.text), ...output.watchouts.map((w) => w.text)];
  const mismatches: string[] = [];
  for (const text of texts) {
    for (const token of extract(text)) {
      if (!allowed.has(token)) mismatches.push(token);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
