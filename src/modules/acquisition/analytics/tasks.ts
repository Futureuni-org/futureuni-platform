/**
 * Analytics AI tasks (Phase 17, module spec §3.15). Registered on the acquisition manifest by Phase
 * 19 through `phases/17/REQUESTS.md`. Imports `defineTask` from `@/platform/ai/define` and
 * `registerTask` from `@/platform/ai/registry` (never the `@/platform/ai` barrel) to avoid the
 * manifest import cycle.
 *
 * - weekly insight (balanced): a short "what changed" summary. It may only restate numbers from its
 *   input (the number-consistency check in `./insight/number-check` enforces this), cites metric
 *   ids, hedges on small samples and never claims a cause as fact. No side-effecting tools; output
 *   is rendered as text (INV-24).
 */

import { defineTask } from "@/platform/ai/define";
import { registerTask } from "@/platform/ai/registry";

import { WeeklyInsightInputSchema, WeeklyInsightOutputSchema } from "./insight/schema";

export const weeklyInsightTask = defineTask({
  id: "acquisition.analytics-weekly-insight",
  module: "acquisition",
  description:
    "Write a short weekly summary of what changed across the service lines, citing metric ids. Only restate numbers from the input; hedge on small samples; never claim a cause as fact.",
  skillPath: "acquisition/analytics-weekly-insight",
  sharedSkills: ["_shared/futureuni-voice"],
  inputSchema: WeeklyInsightInputSchema,
  outputSchema: WeeklyInsightOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_200,
  defaultTemperature: 0.3,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/analytics-weekly-insight",
  mockFixture: "evals/acquisition/analytics-weekly-insight/fixtures/mock.json",
});

export const analyticsTasks = [weeklyInsightTask] as const;

/** Registers the analytics tasks directly (tests and evals, before Phase 19 wires the manifest). */
export function registerAnalyticsTasks(): void {
  for (const task of analyticsTasks) registerTask(task);
}
