import "server-only";

import { z } from "zod";

import type { TaskDefinition } from "@/contracts/ai-service";

const InputSchema = z.object({
  rubric: z.string().min(10),
  candidateOutput: z.unknown(),
});

const OutputSchema = z.object({
  /** 0 (fails all criteria) to 1 (fully satisfies rubric). */
  score: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(2000),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export const evalJudgeTask: TaskDefinition<Input, Output> = {
  id: "platform.eval-judge",
  module: "platform",
  description:
    "Scores a candidate AI output against a rubric string and returns a numeric score plus reasoning.",
  skillPath: "platform/eval-judge",
  sharedSkills: [],
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  modelTier: "fast",
  defaultMaxTokens: 800,
  defaultTemperature: 0,
  vision: false,
  cacheableSystem: false,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/platform/eval-judge",
  mockFixture: "evals/platform/eval-judge/fixtures/default.json",
};
