/**
 * Contract: AI service (docs/contracts/ai-service.md). Every model call goes through runTask
 * (Phase 5, @/platform/ai, the only importer of @anthropic-ai/sdk).
 */

import { z } from "zod";

import { AiOutcomeSchema, CostMicrosSchema, IdSchema, Iso8601Schema, type Actor } from "./common";

export { AiOutcomeSchema }; // OK | REPAIRED | INVALID | TIMEOUT | ERROR | QUOTA_BLOCKED (Prisma enum AiOutcome)

/** "<module>.<task-name>", e.g. "acquisition.outreach-draft". Skill folder: runtime-skills/<module>/<task-name>/. */
export const TaskIdSchema = z
  .string()
  .regex(/^[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Use <module>.<kebab-name>" });
export type TaskId = z.infer<typeof TaskIdSchema>;

export const ModelTierSchema = z.enum(["fast", "balanced", "deep"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;
export const EffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

/** Settings-facing form fixed by SEAM-SETTINGS-AI (lower case); stored on AiCall as the Prisma enum AiLogContent (NONE | REDACTED | FULL). */
export const LogContentSchema = z.enum(["none", "redacted", "full"]);

/** Chooses which reference files the loader adds, from the task input (e.g. by market). Paths are relative to runtime-skills/. */
export type ReferenceSelector<TInput> = (input: TInput) => { path: string; optional?: boolean }[];

export interface TaskDefinition<TInput, TOutput> {
  id: TaskId;
  module: string; // "platform" | "acquisition" | …
  description: string;
  skillPath: string; // "acquisition/outreach-draft" (folder under runtime-skills/)
  sharedSkills: string[]; // e.g. ["_shared/futureuni-voice"]; loaded first
  references?: ReferenceSelector<TInput>; // e.g. selectAcquisitionReferences({ serviceLine, market }) from Phase 7
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  modelTier: ModelTier;
  defaultMaxTokens: number;
  defaultTemperature?: number; // sent only to models that accept sampling params (see rule 12)
  effort?: z.infer<typeof EffortSchema>; // sent only to models that support effort
  vision: boolean;
  cacheableSystem: boolean; // stable system prefix gets a cache breakpoint
  piiPolicy: { allowedPersonalFields: string[] }; // dotted input paths that may contain personal data; all others are stripped
  claims?: { textPaths: string[]; evidenceInputPath: string; requireAtLeastOne: boolean }; // enables assertClaimsCited
  logContent: z.infer<typeof LogContentSchema>; // default "none"; overridable per task in settings (ai.logContentOverrides)
  timeoutMs: number;
  streaming?: boolean; // may be used with streamTask
  evalSuite: string; // "evals/acquisition/outreach-draft"
  mockFixture: string; // "evals/acquisition/outreach-draft/fixtures/mock.json"
}

export const TaskDefinitionMetaSchema = z.object({
  id: TaskIdSchema,
  module: z.string().regex(/^[a-z]+$/),
  description: z.string().min(10).max(400),
  skillPath: z.string().regex(/^[a-z_]+\/[a-z0-9-]+$/),
  sharedSkills: z.array(z.string().regex(/^_shared\/[a-z0-9-]+$/)).default([]),
  modelTier: ModelTierSchema,
  defaultMaxTokens: z.int().min(16).max(64_000),
  defaultTemperature: z.number().min(0).max(1).optional(),
  effort: EffortSchema.optional(),
  vision: z.boolean(),
  cacheableSystem: z.boolean(),
  piiPolicy: z.object({ allowedPersonalFields: z.array(z.string()) }),
  claims: z
    .object({
      textPaths: z.array(z.string()).min(1),
      evidenceInputPath: z.string(),
      requireAtLeastOne: z.boolean(),
    })
    .optional(),
  logContent: LogContentSchema.default("none"),
  timeoutMs: z.int().min(1_000).max(600_000),
  streaming: z.boolean().default(false),
  evalSuite: z.string().startsWith("evals/"),
  mockFixture: z.string().startsWith("evals/"),
});

export const AiUsageSchema = z.object({
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  costMicros: CostMicrosSchema, // computed from src/platform/ai/pricing.ts (verified prices, ADR-027)
  latencyMs: z.int().nonnegative(),
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

export const ImageInputSchema = z
  .object({
    url: z.url().optional(), // Vercel Blob signed URL
    base64: z.string().optional(),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    artifactKey: z.string().optional(), // FileObject key; lets outputs cite the image as evidence
  })
  .refine((i) => Boolean(i.url) !== Boolean(i.base64), {
    error: "Provide exactly one of url or base64",
  });

export const RunTaskContextSchema = z.object({
  leadId: IdSchema.optional(),
  companyId: IdSchema.optional(),
  module: z.string().optional(),
  jobRunId: IdSchema.optional(),
});

export interface RunTaskRequest<TInput> {
  task: TaskId;
  input: TInput; // validated against the task's inputSchema
  actor: Actor;
  context?: z.infer<typeof RunTaskContextSchema>;
  images?: z.infer<typeof ImageInputSchema>[]; // vision tasks only
  options?: {
    promptVersion?: number;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    stream?: false;
  };
}
export interface RunTaskResult<TOutput> {
  output: TOutput;
  usage: AiUsage;
  callId: string;
  promptVersion: number;
  model: string;
  cached: boolean;
}

export type RunTask = <TInput, TOutput>(
  req: RunTaskRequest<TInput>,
) => Promise<RunTaskResult<TOutput>>;
/** Streams text deltas, then one final event with the validated output (or an error). For UI drafting (e.g. outreach-draft-edit). */
export type StreamTask = <TInput>(
  req: Omit<RunTaskRequest<TInput>, "options"> & {
    options?: { promptVersion?: number; maxTokens?: number; signal?: AbortSignal };
  },
) => Promise<ReadableStream<StreamTaskEvent>>;
export type StreamTaskEvent =
  | { type: "delta"; text: string }
  | { type: "final"; output: unknown; usage: AiUsage; callId: string }
  | {
      type: "error";
      code: "AI_OUTPUT_INVALID" | "AI_QUOTA_EXCEEDED" | "AI_TIMEOUT" | "AI_PROVIDER_ERROR";
      message: string;
    };

/** Batches API for large non-urgent jobs (e.g. re-scoring 500 leads). Phase 5 implements it if the API supports batches (it does as of 2026-09). */
export interface BatchHandle {
  batchId: string;
  task: TaskId;
  count: number;
  status: "SUBMITTED" | "IN_PROGRESS" | "ENDED" | "FAILED";
  submittedAt: string;
}
// The doc writes RunBatch and GetBatchResults with a type parameter used only once (<TInput>, <TOutput>),
// which is `unknown` in disguise (lint: no-unnecessary-type-parameters). Written with `unknown`: each
// item's input is validated with the task's inputSchema, and callers parse outputs with its outputSchema.
export type RunBatch = (req: {
  task: TaskId;
  items: { customId: string; input: unknown }[];
  actor: Actor;
}) => Promise<BatchHandle>;
export type GetBatchResults = (
  batchId: string,
) => Promise<
  (
    | { customId: string; ok: true; output: unknown; usage: AiUsage }
    | { customId: string; ok: false; error: string }
  )[]
>;

export type RegisterTask = <TInput, TOutput>(def: TaskDefinition<TInput, TOutput>) => void;
/**
 * Type-erased task definition for arrays (a manifest's aiTasks, an area's tasks.ts export). Produced only by
 * defineTask<TInput, TOutput>() (Phase 5), which validates input with the task's own schema before calling typed
 * members, so the widening to unknown needs no `any` (same pattern as defineJob in jobs.md).
 */
export type AnyTaskDefinition = TaskDefinition<unknown, unknown>;
export type DefineTask = <TInput, TOutput>(
  def: TaskDefinition<TInput, TOutput>,
) => AnyTaskDefinition;
export type GetTask = (id: TaskId) => AnyTaskDefinition; // throws NOT_FOUND for unregistered ids

/**
 * Evidence enforcement (INV-5). Checks every citation marker in the given text(s) against allowedEvidenceIds.
 * Throws AppError("CITATION_INVALID") with details { unknownIds, uncitedSentences } on failure.
 */
export type AssertClaimsCited = (
  text: string | string[],
  allowedEvidenceIds: readonly string[],
  opts?: { requireAtLeastOne?: boolean },
) => void;
/** Removes citation markers for sending/rendering; returns plain text. */
export type StripCitationMarkers = (text: string) => string;
export const CITATION_MARKER = /\[\[(f|s):([a-z0-9]{20,32})\]\]/g; // [[f:<findingId>]] or [[s:<signalId>]]

// ---- Settings shapes (registered by Phase 6 at the Wave 1 merge) ----
// Extends the SEAM-SETTINGS-AI return shape (phase-05 Step 5) with the optional `fallbackModels`; the seam stand-in omits it.
// Budgets are entered in USD (numbers, as the seam fixes them) and compared in integer micro-USD:
// limitMicros = Math.round(usd * 1_000_000) (ADR-027). AiCall.costMicros sums are never converted back to floats for comparison.
export const AiSettingsSchema = z.object({
  modelTiers: z.object({
    fast: z.string().min(3),
    balanced: z.string().min(3),
    deep: z.string().min(3),
  }),
  fallbackModels: z
    .object({
      fast: z.string().optional(),
      balanced: z.string().optional(),
      deep: z.string().optional(),
    })
    .default({}),
  budgets: z.object({
    platformDailyUsd: z.number().nonnegative(),
    platformMonthlyUsd: z.number().nonnegative(),
    perModuleDailyUsd: z.record(z.string(), z.number().nonnegative()),
    perUserDailyCalls: z.int().nonnegative(),
  }),
  logContentOverrides: z.record(TaskIdSchema, LogContentSchema),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

// ---- Stored content log (AiCall.contentRedacted when logContent ≠ none) ----
export const AiContentLogSchema = z.object({
  mode: z.enum(["redacted", "full"]),
  system: z.string().max(200_000).optional(), // compiled prompt reference or text
  input: z.string().max(200_000),
  output: z.string().max(200_000),
  expiresAt: Iso8601Schema, // purged after platform.retention.aiContentDays
});
export type AiContentLog = z.infer<typeof AiContentLogSchema>;

// ---- Prompt versions (Phase 5 services; Phase 18 screens) ----
export type PublishPromptVersion = (
  actor: Actor,
  task: TaskId,
  note: string,
  opts?: { force?: boolean; forceReason?: string },
) => Promise<{ version: number; evalScore: number; previousScore: number | null }>;
export type ActivatePromptVersion = (actor: Actor, task: TaskId, version: number) => Promise<void>;
