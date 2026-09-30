/**
 * Enrichment AI tasks (Phase 9). Two tasks — `extract-people` and `pick-contact` — reference the
 * Phase 7 runtime files under `runtime-skills/acquisition/_references/`. Until Wave 2 is merged
 * those files don't exist in this worktree, so the references are declared **optional**.
 */

import { z } from "zod";

import { defineTask } from "@/platform/ai/define";
import type { Market, ServiceLine } from "@/contracts/common";
import { ServiceLineSchema, MarketSchema } from "@/contracts/common";

// ---- extract-people --------------------------------------------------------

const ExtractPeopleInput = z.object({
  companyName: z.string().min(1).max(200),
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  pages: z.array(
    z.object({
      url: z.url(),
      title: z.string().max(200).optional(),
      text: z.string().max(30_000),
    }),
  ).min(1).max(6),
});

const ExtractPeopleOutput = z.object({
  people: z.array(
    z.object({
      name: z.string().min(1).max(120),
      role: z.string().max(120),
      seniority: z.enum(["owner", "exec", "manager", "staff", "unknown"]),
      evidenceQuote: z.string().min(1).max(300),
    }),
  ),
});

export const extractPeopleTask = defineTask({
  id: "acquisition.enrich-extract-people",
  module: "acquisition",
  description: "Extract people (name, role, seniority) from team and about pages, quoting evidence.",
  skillPath: "acquisition/enrich-extract-people",
  sharedSkills: ["_shared/futureuni-voice"],
  references: (input: z.infer<typeof ExtractPeopleInput>): { path: string; optional?: boolean }[] => [
    { path: `acquisition/_references/lines/${lineFile(input.serviceLine)}`, optional: true },
    { path: `acquisition/_references/markets/${marketFile(input.market)}`, optional: true },
  ],
  inputSchema: ExtractPeopleInput,
  outputSchema: ExtractPeopleOutput,
  modelTier: "fast",
  defaultMaxTokens: 800,
  defaultTemperature: 0.1,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["pages"] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/enrich-extract-people",
  mockFixture: "evals/acquisition/enrich-extract-people/fixtures/mock.json",
});

// ---- pick-contact ----------------------------------------------------------

const PickContactInput = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  size: z.enum(["SOLO", "SIZE_2_10", "SIZE_11_50", "SIZE_51_200", "SIZE_201_1000", "SIZE_1000_PLUS", "UNKNOWN"]),
  candidates: z.array(
    z.object({
      id: z.string(),
      name: z.string().max(120).nullable(),
      role: z.string().max(120).nullable(),
      emailStatus: z.enum(["UNVERIFIED", "VALID", "RISKY", "INVALID", "UNKNOWN"]).nullable(),
      emailKind: z.enum(["PERSONAL", "ROLE"]).nullable(),
      source: z.string(),
    }),
  ).min(1).max(20),
  rolePriority: z.array(z.string().min(1).max(60)).min(1),
});

const PickContactOutput = z.object({
  primaryContactId: z.string(),
  backupContactIds: z.array(z.string()).default([]),
  reason: z.string().min(3).max(280),
});

export const pickContactTask = defineTask({
  id: "acquisition.enrich-pick-contact",
  module: "acquisition",
  description: "Choose the best contact for the service line, following the profile's role priorities.",
  skillPath: "acquisition/enrich-pick-contact",
  sharedSkills: ["_shared/futureuni-voice"],
  references: (input: z.infer<typeof PickContactInput>): { path: string; optional?: boolean }[] => [
    { path: `acquisition/_references/lines/${lineFile(input.serviceLine)}`, optional: true },
    { path: `acquisition/_references/markets/${marketFile(input.market)}`, optional: true },
  ],
  inputSchema: PickContactInput,
  outputSchema: PickContactOutput,
  modelTier: "fast",
  defaultMaxTokens: 300,
  defaultTemperature: 0.1,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["candidates.name", "candidates.role"] },
  logContent: "none",
  timeoutMs: 45_000,
  evalSuite: "evals/acquisition/enrich-pick-contact",
  mockFixture: "evals/acquisition/enrich-pick-contact/fixtures/mock.json",
});

function lineFile(line: ServiceLine): string {
  return `${line.toLowerCase().replace(/_/g, "-")}.md`;
}
function marketFile(market: Market): string {
  return market === "NIGERIA" ? "nigeria.md" : "international.md";
}

export const enrichmentTasks = [extractPeopleTask, pickContactTask] as const;
