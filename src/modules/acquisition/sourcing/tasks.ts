import "server-only";

/**
 * Sourcing AI tasks (Phase 8). Both use the fast tier. They reference the Phase 7 runtime files
 * under `runtime-skills/acquisition/_references/`; those are declared **optional** here (the safe
 * wave pattern) and made required at Wave 2 integration. Registered on the acquisition manifest by
 * Phase 19 through `phases/08/REQUESTS.md`; `registerSourcingTasks()` lets tests and evals register
 * them directly while they aren't on the manifest.
 */

import { z } from "zod";

import { MarketSchema, ServiceLineSchema, type Market, type ServiceLine } from "@/contracts/common";
import { defineTask, registerTask } from "@/platform/ai";

// ---- source-classify-job-post ---------------------------------------------

export const ClassifyJobPostInputSchema = z.object({
  title: z.string().min(1).max(200),
  companyName: z.string().min(1).max(200),
  snippet: z.string().max(4_000).optional(),
  location: z.string().max(200).optional(),
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
});
export type ClassifyJobPostInput = z.infer<typeof ClassifyJobPostInputSchema>;

export const ClassifyJobPostOutputSchema = z.object({
  /** The line this post is a real hiring signal for, or null when it isn't one for any line. */
  relevantLine: ServiceLineSchema.nullable(),
  /** The employer is a recruitment or staffing agency posting on someone else's behalf. */
  isRecruitmentAgency: z.boolean(),
  /** The employer is building a full in-house team (3+ roles), so they won't outsource. */
  isInHouseFullTeam: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(3).max(280),
});
export type ClassifyJobPostOutput = z.infer<typeof ClassifyJobPostOutputSchema>;

// ---- source-extract-company -----------------------------------------------

export const ExtractCompanyInputSchema = z.object({
  rawText: z.string().min(1).max(2_000),
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
});
export type ExtractCompanyInput = z.infer<typeof ExtractCompanyInputSchema>;

export const ExtractCompanyOutputSchema = z.object({
  companyName: z.string().min(1).max(200),
  website: z.string().max(500).nullable(),
  city: z.string().max(80).nullable(),
  country: z.string().length(2).nullable(),
});
export type ExtractCompanyOutput = z.infer<typeof ExtractCompanyOutputSchema>;

function lineFile(line: ServiceLine): string {
  return `${line.toLowerCase().replace(/_/g, "-")}.md`;
}
function marketFile(market: Market): string {
  return market === "NIGERIA" ? "nigeria.md" : "international.md";
}
function references(input: {
  serviceLine: ServiceLine;
  market: Market;
}): { path: string; optional?: boolean }[] {
  return [
    { path: `acquisition/_references/lines/${lineFile(input.serviceLine)}`, optional: true },
    { path: `acquisition/_references/markets/${marketFile(input.market)}`, optional: true },
  ];
}

export const classifyJobPostTask = defineTask({
  id: "acquisition.source-classify-job-post",
  module: "acquisition",
  description:
    "Decide whether a job post is a real hiring signal for a FUTUREUNI line, and flag recruitment agencies and full in-house teams.",
  skillPath: "acquisition/source-classify-job-post",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: ClassifyJobPostInputSchema,
  outputSchema: ClassifyJobPostOutputSchema,
  modelTier: "fast",
  defaultMaxTokens: 300,
  defaultTemperature: 0,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/acquisition/source-classify-job-post",
  mockFixture: "evals/acquisition/source-classify-job-post/fixtures/mock.json",
});

export const extractCompanyTask = defineTask({
  id: "acquisition.source-extract-company",
  module: "acquisition",
  description:
    "Extract a clean company name, website and city/country from a messy source record (e.g. an unstructured employer name).",
  skillPath: "acquisition/source-extract-company",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: ExtractCompanyInputSchema,
  outputSchema: ExtractCompanyOutputSchema,
  modelTier: "fast",
  defaultMaxTokens: 200,
  defaultTemperature: 0,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/acquisition/source-extract-company",
  mockFixture: "evals/acquisition/source-extract-company/fixtures/mock.json",
});

export const sourcingTasks = [classifyJobPostTask, extractCompanyTask] as const;

/**
 * Registers the sourcing tasks directly. Idempotent (registering the same object twice is a no-op),
 * so it's safe both here and after Phase 19 adds them to the manifest. Tests and evals call it
 * because the tasks aren't manifest-wired inside this phase's worktree.
 */
export function registerSourcingTasks(): void {
  for (const task of sourcingTasks) registerTask(task);
}
