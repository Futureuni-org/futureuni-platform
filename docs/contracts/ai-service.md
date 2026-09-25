# Contract: AI service

| | |
|---|---|
| Module | `src/contracts/ai-service.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 5 (`@/platform/ai`, server-only; the only importer of `@anthropic-ai/sdk`, ADR-006) |
| Task owners | Each phase registers its own tasks (`tasks.ts` in its folder) and owns `runtime-skills/<module>/<task>/` and `evals/<module>/<task>/` (see the CLAUDE.md ownership map) |
| Consumers | Phases 7–14, 17 and 18 (prompt-version and usage screens); future modules |
| Decisions | ADR-006 (single gateway), ADR-007 (runtime skills), ADR-018 (model tiers), ADR-027 (micro-USD costs), ADR-028 (`runTask` naming) |

## 1. Purpose

Every AI feature in every module runs through one call: `runTask({ task, input, actor })`. The service:
- loads the task's versioned runtime skill
- strips personal data the task doesn't need
- calls the model for the task's tier
- validates the output against the task's Zod schema, with one repair attempt
- enforces quotas and budgets
- logs an `AiCall` row with the cost

Mock mode returns deterministic fixtures, so the whole platform works without an API key (ADR-005).

> ADR-028: the Phase 0 brief wrote `ai.run({ task, promptVersion?, input, outputSchema, context })`. That call is `runTask()` below. The output schema is part of the registered `TaskDefinition` rather than a per-call argument, so a task's schema, prompt and evals always change together.

## 2. Types and schemas

```ts
// src/contracts/ai-service.ts
import { z } from "zod";
import { IdSchema, Iso8601Schema, CostMicrosSchema, AiOutcomeSchema, type Actor } from "./common";
export { AiOutcomeSchema };                                               // OK | REPAIRED | INVALID | TIMEOUT | ERROR | QUOTA_BLOCKED (Prisma enum AiOutcome)

/** "<module>.<task-name>", e.g. "acquisition.outreach-draft". Skill folder: runtime-skills/<module>/<task-name>/. */
export const TaskIdSchema = z.string().regex(/^[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Use <module>.<kebab-name>" });
export type TaskId = z.infer<typeof TaskIdSchema>;

export const ModelTierSchema = z.enum(["fast", "balanced", "deep"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;
export const EffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

/** Settings-facing form fixed by SEAM-SETTINGS-AI (lower case); stored on AiCall as the Prisma enum AiLogContent (NONE | REDACTED | FULL). */
export const LogContentSchema = z.enum(["none", "redacted", "full"]);

/** Chooses which reference files the loader adds, from the task input (e.g. by market). Paths are relative to runtime-skills/. */
export type ReferenceSelector<TInput> = (input: TInput) => Array<{ path: string; optional?: boolean }>;

export interface TaskDefinition<TInput, TOutput> {
  id: TaskId;
  module: string;                                   // "platform" | "acquisition" | …
  description: string;
  skillPath: string;                                // "acquisition/outreach-draft" (folder under runtime-skills/)
  sharedSkills: string[];                           // e.g. ["_shared/futureuni-voice"]; loaded first
  references?: ReferenceSelector<TInput>;           // e.g. selectAcquisitionReferences({ serviceLine, market }) from Phase 7
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  modelTier: ModelTier;
  defaultMaxTokens: number;
  defaultTemperature?: number;                      // sent only to models that accept sampling params (see rule 12)
  effort?: z.infer<typeof EffortSchema>;            // sent only to models that support effort
  vision: boolean;
  cacheableSystem: boolean;                         // stable system prefix gets a cache breakpoint
  piiPolicy: { allowedPersonalFields: string[] };   // dotted input paths that may contain personal data; all others are stripped
  claims?: { textPaths: string[]; evidenceInputPath: string; requireAtLeastOne: boolean };   // enables assertClaimsCited
  logContent: z.infer<typeof LogContentSchema>;     // default "none"; overridable per task in settings (ai.logContentOverrides)
  timeoutMs: number;
  streaming?: boolean;                              // may be used with streamTask
  evalSuite: string;                                // "evals/acquisition/outreach-draft"
  mockFixture: string;                              // "evals/acquisition/outreach-draft/fixtures/mock.json"
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
  claims: z.object({ textPaths: z.array(z.string()).min(1), evidenceInputPath: z.string(), requireAtLeastOne: z.boolean() }).optional(),
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
  costMicros: CostMicrosSchema,          // computed from src/platform/ai/pricing.ts (verified prices, ADR-027)
  latencyMs: z.int().nonnegative(),
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

export const ImageInputSchema = z.object({
  url: z.url().optional(),               // Vercel Blob signed URL
  base64: z.string().optional(),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  artifactKey: z.string().optional(),    // FileObject key; lets outputs cite the image as evidence
}).refine((i) => Boolean(i.url) !== Boolean(i.base64), { error: "Provide exactly one of url or base64" });

export const RunTaskContextSchema = z.object({
  leadId: IdSchema.optional(), companyId: IdSchema.optional(), module: z.string().optional(), jobRunId: IdSchema.optional(),
});

export type RunTaskRequest<TInput> = {
  task: TaskId;
  input: TInput;                                    // validated against the task's inputSchema
  actor: Actor;
  context?: z.infer<typeof RunTaskContextSchema>;
  images?: Array<z.infer<typeof ImageInputSchema>>; // vision tasks only
  options?: { promptVersion?: number; maxTokens?: number; temperature?: number; timeoutMs?: number; stream?: false };
};
export type RunTaskResult<TOutput> = {
  output: TOutput; usage: AiUsage; callId: string; promptVersion: number; model: string; cached: boolean;
};

export type RunTask = <TInput, TOutput>(req: RunTaskRequest<TInput>) => Promise<RunTaskResult<TOutput>>;
/** Streams text deltas, then one final event with the validated output (or an error). For UI drafting (e.g. outreach-draft-edit). */
export type StreamTask = <TInput>(req: Omit<RunTaskRequest<TInput>, "options"> & { options?: { promptVersion?: number; maxTokens?: number; signal?: AbortSignal } }) =>
  Promise<ReadableStream<StreamTaskEvent>>;
export type StreamTaskEvent =
  | { type: "delta"; text: string }
  | { type: "final"; output: unknown; usage: AiUsage; callId: string }
  | { type: "error"; code: "AI_OUTPUT_INVALID" | "AI_QUOTA_EXCEEDED" | "AI_TIMEOUT" | "AI_PROVIDER_ERROR"; message: string };

/** Batches API for large non-urgent jobs (e.g. re-scoring 500 leads). Phase 5 implements it if the API supports batches (it does as of 2026-09). */
export type BatchHandle = { batchId: string; task: TaskId; count: number; status: "SUBMITTED" | "IN_PROGRESS" | "ENDED" | "FAILED"; submittedAt: string };
export type RunBatch = <TInput>(req: { task: TaskId; items: Array<{ customId: string; input: TInput }>; actor: Actor }) => Promise<BatchHandle>;
export type GetBatchResults = <TOutput>(batchId: string) => Promise<Array<{ customId: string; ok: true; output: TOutput; usage: AiUsage } | { customId: string; ok: false; error: string }>>;

export type RegisterTask = <TInput, TOutput>(def: TaskDefinition<TInput, TOutput>) => void;
/**
 * Type-erased task definition for arrays (a manifest's aiTasks, an area's tasks.ts export). Produced only by
 * defineTask<TInput, TOutput>() (Phase 5), which validates input with the task's own schema before calling typed
 * members, so the widening to unknown needs no `any` (same pattern as defineJob in jobs.md).
 */
export type AnyTaskDefinition = TaskDefinition<unknown, unknown>;
export type DefineTask = <TInput, TOutput>(def: TaskDefinition<TInput, TOutput>) => AnyTaskDefinition;
export type GetTask = (id: TaskId) => AnyTaskDefinition;   // throws NOT_FOUND for unregistered ids

/**
 * Evidence enforcement (INV-5). Checks every citation marker in the given text(s) against allowedEvidenceIds.
 * Throws AppError("CITATION_INVALID") with details { unknownIds, uncitedSentences } on failure.
 */
export type AssertClaimsCited = (text: string | string[], allowedEvidenceIds: readonly string[], opts?: { requireAtLeastOne?: boolean }) => void;
/** Removes citation markers for sending/rendering; returns plain text. */
export type StripCitationMarkers = (text: string) => string;
export const CITATION_MARKER = /\[\[(f|s):([a-z0-9]{20,32})\]\]/g;   // [[f:<findingId>]] or [[s:<signalId>]]

// ---- Settings shapes (registered by Phase 6 at the Wave 1 merge) ----
// Extends the SEAM-SETTINGS-AI return shape (phase-05 Step 5) with the optional `fallbackModels`; the seam stand-in omits it.
// Budgets are entered in USD (numbers, as the seam fixes them) and compared in integer micro-USD:
// limitMicros = Math.round(usd * 1_000_000) (ADR-027). AiCall.costMicros sums are never converted back to floats for comparison.
export const AiSettingsSchema = z.object({
  modelTiers: z.object({ fast: z.string().min(3), balanced: z.string().min(3), deep: z.string().min(3) }),
  fallbackModels: z.object({ fast: z.string().optional(), balanced: z.string().optional(), deep: z.string().optional() }).default({}),
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
  system: z.string().max(200_000).optional(),       // compiled prompt reference or text
  input: z.string().max(200_000),
  output: z.string().max(200_000),
  expiresAt: Iso8601Schema,                          // purged after platform.retention.aiContentDays
});
export type AiContentLog = z.infer<typeof AiContentLogSchema>;

// ---- Prompt versions (Phase 5 services; Phase 18 screens) ----
export type PublishPromptVersion = (actor: Actor, task: TaskId, note: string, opts?: { force?: boolean; forceReason?: string }) =>
  Promise<{ version: number; evalScore: number; previousScore: number | null }>;
export type ActivatePromptVersion = (actor: Actor, task: TaskId, version: number) => Promise<void>;
```

## 3. Runtime skills layout and loading

```
runtime-skills/
  _shared/futureuni-voice/SKILL.md          # Phase 5: who FUTUREUNI is, four services, tone, banned phrases, evidence and no-invention rules
  platform/<task>/SKILL.md                  # Phase 5: platform.summarize-company, platform.eval-judge
  acquisition/_references/…                 # Phase 7: fixed file list (wave-2 guide, Part B1)
  acquisition/<task-name>/SKILL.md          # the phase owning the task
  acquisition/<task-name>/references/*.md   # optional task-specific references
  acquisition/<task-name>/examples/*.json   # optional few-shot pairs { input, output }
evals/<module>/<task-name>/cases/*.json     # eval cases; fixtures/ for mock and images
```

The system prompt is composed in this order:
1. the shared skills
2. the task `SKILL.md`
3. the selected references
4. the examples

This stable content comes first, and the cache breakpoint goes after it. The per-call input follows, inside delimited data blocks.

## 4. Rules

1. **One gateway.** Only `src/platform/ai/**` imports `@anthropic-ai/sdk` (lint-enforced), and every model call goes through `runTask`, `streamTask` or `runBatch`.
2. **Registration.** Tasks are registered from each module's `tasks.ts` (or the manifest's `aiTasks`). A task ID is `<module>.<kebab-name>`. `getTask` throws `NOT_FOUND` for an unregistered ID.
3. **Validation.** `input` is parsed with `inputSchema` before anything is sent. Output is requested with the API's native structured-output feature (`output_config.format`) where available, then validated with `outputSchema`. Structured output is not combined with citations-enabled documents.
4. **One repair.** On a schema failure the service makes one repair attempt that sends back the validation issues. A second failure throws `AppError("AI_OUTPUT_INVALID")` and logs outcome `INVALID`. It never loops.
5. **Evidence (INV-5).**
   - Tasks that write claims about a prospect declare `claims`. Every sentence that states a fact about the prospect ends with one or more markers: `[[f:<findingId>]]` for a finding or `[[s:<signalId>]]` for a signal.
   - After validation, `assertClaimsCited` checks that every marker's ID is in the input evidence. With `requireAtLeastOne`, at least one marker must be present.
   - Markers are kept in the stored draft (`Message.body`) so the review UI can link sentences to evidence. The send path removes them with `stripCitationMarkers`, and `MessageCitation` rows mirror the cited IDs.
6. **Untrusted content (INV-24).** Scraped text, reviews, job posts, replies, CSV fields and transcripts go inside clearly delimited data blocks. The system prompt says they are data, never instructions. No task has side-effecting tools.
7. **PII minimisation (INV-13).** Before sending, input fields not listed in `piiPolicy.allowedPersonalFields` are removed. Prompt and response text is not stored unless `logContent` is `redacted` (emails and phones masked) or `full`. Stored content expires after `platform.retention.aiContentDays`.
8. **Every call writes one `AiCall` row**, including blocked and failed calls. The row records: task, promptVersion, model, provider, actor, context IDs, input, output and cache tokens, `costMicros`, latency, outcome, errorCode, stopReason and logContent (INV-13).
9. **Quotas and budgets** are read from `AiSettings`: platform daily and monthly, per module per day, per user per day in calls, and per task max tokens. A limit that has been reached fails fast with `AI_QUOTA_EXCEEDED` (outcome `QUOTA_BLOCKED`). At 80% of a budget the service emits `ai.budget.warning`, and at 100% `ai.budget.exceeded`.
10. **Resilience.**
    - Each task has its own timeout (`AI_TIMEOUT`).
    - 429, 5xx and overload errors retry with exponential backoff, respecting `retry-after`.
    - A circuit breaker pauses calls after repeated provider failures.
    - A fallback model within the same tier is used if `fallbackModels` names one.
    - Every response's stop reason is checked: `max_tokens` means truncated, and `refusal` is declined.
11. **Models live in config (ADR-018).** Tiers map to model IDs through `ai.modelTiers`, which defaults from the `AI_MODEL_FAST`, `AI_MODEL_BALANCED` and `AI_MODEL_DEEP` env vars. Code never names a model ID.
12. **Per-model parameters.** Some current Claude models reject sampling parameters (`temperature`, `top_p`) and extended-thinking budgets, while others accept an `effort` setting. The adapter sends only the parameters the resolved model accepts. Phase 5 verifies the current rules against the Claude API docs and records them in `src/platform/ai/pricing.ts` or a model-capability table.
13. **Prompt versions.**
    - The files are the source. Publishing creates a `PromptVersion` row with the task, version, content hash and compiled snapshot, changelog, author, eval score and `isActive`.
    - `runTask` uses the active version unless `options.promptVersion` is given.
    - `publishPromptVersion` runs the task's eval suite first. It refuses when the score is below the active version's minus the tolerance, unless an `ADMIN` passes `force` with a reason.
    - Rolling back re-activates an older version. Every publish and activate is audited (INV-20) and requires `platform.prompt.publish` or `platform.prompt.activate`.
14. **Mock mode** (`MOCKS=true` or the provider setting set to `mock`):
    - The provider returns the fixture from `mockFixture`, keyed on a hash of the validated input, with a default fixture when there's no match.
    - It simulates latency and token usage.
    - It supports `AI_MOCK_FAIL=invalid|timeout|429` so error paths are testable.
15. **References.** A reference marked `optional: true` may be missing in development and test (logged). In production a missing reference fails the call with `INTERNAL`. The wave-2 integration makes the acquisition references required.

## 5. Worked example

```ts
// src/platform/ai/tasks.ts (Phase 5): the example task that proves the path
registerTask({
  id: "platform.summarize-company",
  module: "platform",
  description: "Summarise a company in 2–3 sentences from supplied facts and evidenced signals.",
  skillPath: "platform/summarize-company",
  sharedSkills: ["_shared/futureuni-voice"],
  inputSchema: z.object({
    company: z.object({ name: z.string(), city: z.string().nullable(), country: z.string().length(2), industry: z.string().nullable() }),
    signals: z.array(z.object({ id: z.string(), type: z.string(), evidenceText: z.string(), sourceUrl: z.url() })).max(20),
  }),
  outputSchema: z.object({ summary: z.string().max(600), citedEvidenceIds: z.array(z.string()) }),
  modelTier: "fast",
  defaultMaxTokens: 600,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  claims: { textPaths: ["summary"], evidenceInputPath: "signals[].id", requireAtLeastOne: true },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/platform/summarize-company",
  mockFixture: "evals/platform/summarize-company/fixtures/mock.json",
});

const { output, usage, promptVersion } = await runTask({
  task: "platform.summarize-company",
  input: { company: { name: "Mama Put Kitchen", city: "Lagos", country: "NG", industry: "Restaurant" },
           signals: [{ id: "cm1sig00000000000000000001", type: "no_website", evidenceText: "Google Maps listing has no website field.",
                       sourceUrl: "https://maps.google.com/?cid=1234567890" }] },
  actor: { type: "SYSTEM", job: "acquisition.lead.advance" },
  context: { companyId: "cm1comp0000000000000000007" },
});
// output.summary: "Mama Put Kitchen is a Lagos restaurant with no website on its Google Maps listing [[s:cm1sig00000000000000000001]]."
// usage.costMicros: e.g. 410 (≈ $0.00041)
```

## 6. Invalid example (Phase 2 test)

```ts
TaskDefinitionMetaSchema.safeParse({ ...validSummarize, id: "summarizeCompany", modelTier: "turbo", evalSuite: "tests/evals" });
// → fails: ["id"] "Use <module>.<kebab-name>"; ["modelTier"] invalid enum value (fast | balanced | deep);
//   ["evalSuite"] must start with "evals/"
```
