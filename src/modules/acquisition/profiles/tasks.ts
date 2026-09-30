import "server-only";

/**
 * AI tasks this area registers (Phase 5 registry discovers them via the module manifest).
 * Wave-2 phases 8/9/10 each export their own tasks the same way; the acquisition manifest
 * (Phase 19) merges them all at Wave-2 integration (Part B3).
 *
 * `acquisition.profile-sanity` (spec §3.15) is eval-only: it proves the runtime references
 * keep openers truthful. It is NOT called from the outreach path.
 */

import { z } from "zod";

import { FindingSeveritySchema, MarketSchema, ServiceLineSchema } from "@/contracts/common";
import type { AnyTaskDefinition, TaskDefinition } from "@/contracts/ai-service";

import { selectAcquisitionReferences } from "./resolve";

const InputSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  contactFirstName: z.string().min(1).max(60),
  findings: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9]{20,32}$/, { error: "id must be 20-32 lower-case alphanumerics" }),
        severity: FindingSeveritySchema,
        checkId: z.string().min(3).max(80),
        text: z.string().min(3).max(400),
      }),
    )
    .min(1)
    .max(10),
  missingFactExamples: z.array(z.string().min(3).max(200)).default([]),
});

const OutputSchema = z.object({
  /** Two-sentence opener with `[[f:<id>]]` citation markers referencing supplied findings. */
  opener: z.string().min(20).max(600),
  /** Finding ids actually cited; must be a subset of the input findings' ids. */
  citedEvidenceIds: z.array(z.string().min(20)).min(1),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export const profileSanityTask: TaskDefinition<Input, Output> = {
  id: "acquisition.profile-sanity",
  module: "acquisition",
  description:
    "Eval-only opener writer that proves the runtime references keep openers truthful and on-brand.",
  skillPath: "acquisition/profile-sanity",
  sharedSkills: ["_shared/futureuni-voice"],
  references: (input) =>
    selectAcquisitionReferences({ serviceLine: input.serviceLine, market: input.market }),
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 600,
  defaultTemperature: 0.4,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["contactFirstName"] },
  claims: {
    textPaths: ["opener"],
    evidenceInputPath: "findings",
    requireAtLeastOne: true,
  },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/acquisition/profile-sanity",
  mockFixture: "evals/acquisition/profile-sanity/fixtures/default.json",
};

/** Type-erased entry (`aiTasks[]` on the module manifest). */
export const profilesAiTasks: readonly AnyTaskDefinition[] = [
  profileSanityTask as unknown as AnyTaskDefinition,
];
