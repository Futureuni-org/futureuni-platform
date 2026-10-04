/**
 * Generates the weekly insight (US-43): runs the AI task, then enforces the number-consistency
 * check. If the model states a number not in the input, it gets one more attempt; a second failure
 * raises `AI_OUTPUT_INVALID` rather than show an invented figure (the same contract as the Phase 14
 * proposal draft). The model has no side-effecting tools and its output is used as text (INV-24).
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { runTask } from "@/platform/ai";

import { weeklyInsightTask } from "../tasks";
import { checkInsightNumbers } from "./number-check";
import type { WeeklyInsightInput, WeeklyInsightOutput } from "./schema";

export interface GeneratedInsight {
  insight: WeeklyInsightOutput;
  callId: string;
}

export async function generateWeeklyInsight(
  actor: Actor,
  input: WeeklyInsightInput,
): Promise<GeneratedInsight> {
  let lastMismatches: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await runTask<WeeklyInsightInput, WeeklyInsightOutput>({
      task: weeklyInsightTask.id,
      input,
      actor,
      context: { module: "acquisition" },
    });
    const check = checkInsightNumbers(result.output, input);
    if (check.ok) return { insight: result.output, callId: result.callId };
    lastMismatches = check.mismatches;
  }
  throw new AppError(
    "AI_OUTPUT_INVALID",
    "The weekly insight stated numbers that weren't in the metrics.",
    { details: { mismatches: lastMismatches } },
  );
}
