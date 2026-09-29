import "server-only";

import { z } from "zod";

import type { TaskDefinition } from "@/contracts/ai-service";

import { defineTask } from "../registry";

const SignalSchema = z.object({
  id: z.string().min(1),
  kind: z.string(),
  text: z.string(),
  sourceUrl: z.string().optional(),
});

const InputSchema = z.object({
  company: z.object({
    name: z.string(),
    website: z.string().optional(),
    city: z.string().optional(),
    country: z.string().length(2).optional(),
    market: z.enum(["NG", "INTL"]),
  }),
  signals: z.array(SignalSchema).min(1).max(20),
});

const OutputSchema = z.object({
  /** 2–3 sentence company summary with [[s:<signalId>]] citation markers. */
  summary: z.string().min(20).max(1200),
  /** Signal ids actually cited; must be a subset of the input's signal ids. */
  citedEvidenceIds: z.array(z.string()).min(1),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/** Selects a market-specific reference (voice examples) when authoring an outreach-style summary. */
function selectReferences(input: Input): { path: string; optional?: boolean }[] {
  return [
    {
      path:
        input.company.market === "NG"
          ? "platform/summarize-company/references/market-nigeria.md"
          : "platform/summarize-company/references/market-international.md",
      optional: true,
    },
  ];
}

export const summarizeCompanyTask: TaskDefinition<Input, Output> = {
  id: "platform.summarize-company",
  module: "platform",
  description:
    "Summarise a company in 2–3 sentences from facts and cited signals; injection-robust.",
  skillPath: "platform/summarize-company",
  sharedSkills: ["_shared/futureuni-voice"],
  references: selectReferences,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 400,
  defaultTemperature: 0.3,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  claims: {
    textPaths: ["summary"],
    evidenceInputPath: "signals",
    requireAtLeastOne: true,
  },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/platform/summarize-company",
  mockFixture: "evals/platform/summarize-company/fixtures/default.json",
};

/** Registers the platform-owned worked example task. */
export function registerSummarizeCompany(): void {
  defineTask(summarizeCompanyTask);
}
