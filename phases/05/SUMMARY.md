# Phase 05: AI service — Summary

| | |
|---|---|
| Phase | 05, AI service |
| Branch | `phase/05-ai-service` |
| Batch / wave | B1 / Wave 1 |
| Date finished | 2026-09-29 |
| Prompt | `docs/prompts/wave-1/phase-05-ai-service.md` |
| Verification | `pnpm check`: Pass (lint, typecheck, test 469 pass, build) · `pnpm test:e2e`: Not run (no e2e route added; Phase 18 wires the UI) · `saas-review`: not yet re-run on the diff — recommended before merge |

## What was built

`src/platform/ai` is now the single gateway to Claude for the whole platform. `runTask`
validates the input, strips PII per the task's `piiPolicy`, composes a cache-friendly
system prompt from runtime skills, calls the model via native structured output
(`messages.parse` + `zodOutputFormat`), validates the parsed output against the task's
Zod `outputSchema`, retries once on schema failure, enforces INV-5 citation coverage,
records one `AiCall` row with `costMicros` in integer micro-USD (ADR-027) and — before
any of that — refuses to run when a platform / module / user budget is at 100%.
Structured output uses the SDK's `zodOutputFormat` helper; no `zod-to-json-schema`
dependency was needed. The mock provider is deterministic (fixture keyed on input hash,
`AI_MOCK_FAIL` simulates `empty | invalid | timeout | 429`) so the whole platform works
end-to-end without an API key (ADR-005). Prompt versions can be published (`publishPromptVersion`,
eval-gated with a configurable regression tolerance), activated, listed and diffed,
all audited via SEAM-AUDIT. The eval harness ships as `pnpm evals [task] [--version N]
[--live]`; the platform's worked-example task `platform.summarize-company` passes 6/6
cases in mock mode, including the injection-attempt case that must be treated as data
(P5-AC2), and the total mock cost is $0.03.

**Acceptance criteria met** (docs/specs/platform.md P5):

- **P5-AC1** — Every criterion of US-17 and US-18 passes with the mock provider:
  every `runTask` writes an `AiCall` (AC-17.1); the budget path throws
  `AI_QUOTA_EXCEEDED` with outcome `QUOTA_BLOCKED` (AC-17.2); 80% emits
  `ai.budget.warning` per window (AC-17.3); managers cannot call
  `getUsageSummary` (AC-17.4). `publishPromptVersion` refuses regressions
  (AC-18.1), `activatePromptVersion` audits rollbacks (AC-18.2), non-admins are
  refused (AC-18.3).
- **P5-AC2** — `platform.summarize-company` case `06-injection-attempt`
  passes: the model treats the input as data (INV-24 delimiter escapes the
  block) and cites only supplied evidence ids.
- **P5-AC3** — Given an output that fails schema validation twice, `runTask`
  throws `AI_OUTPUT_INVALID` and the `AiCall` row records outcome `INVALID`
  (see `run-task.ts` repair path).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/platform/ai/index.ts` | Public API re-exports; boots the registry and platform tasks. |
| `src/platform/ai/README.md` | "How to add a new AI task" walkthrough for later phases. |
| `src/platform/ai/_seams.ts` | Wave-1 seam stand-ins (SEAM-AI-CREDENTIALS, SEAM-SETTINGS-AI, SEAM-PERMISSION, SEAM-AUDIT). |
| `src/platform/ai/pricing.ts` | Verified per-model micro-USD prices; `computeCostMicros` and `buildUsage`. |
| `src/platform/ai/model-capabilities.ts` | Per-model `acceptsTemperature` / `acceptsEffort` / adaptive-thinking table. |
| `src/platform/ai/errors.ts` | AI-specific `AppError` helpers. |
| `src/platform/ai/types.ts` | Local internal types (StopReason, AiCallInput). |
| `src/platform/ai/citations.ts` | `assertClaimsCited`, `stripCitationMarkers` (INV-5). |
| `src/platform/ai/pii.ts` | `applyPiiPolicy` — deep-clone strip disallowed personal fields (INV-13). |
| `src/platform/ai/quota.ts` | Platform / module / user budget checks; emits `ai.budget.warning` and `.exceeded`. |
| `src/platform/ai/usage-log.ts` | `writeAiCallRow`, `buildAiCallInput` — one `AiCall` per terminal state. |
| `src/platform/ai/registry.ts` | `registerTask`, `defineTask`, `getTask`; boots from `getAllAiTasks()` (Phase 2). |
| `src/platform/ai/skills/loader.ts` | Composes cache-friendly system prompt from shared+task+references+examples. |
| `src/platform/ai/skills/delimiter.ts` | `wrapUntrusted` — INV-24 delimited data blocks with delimiter escaping. |
| `src/platform/ai/skills/references.ts` | Reads reference files from `runtime-skills/`; optional-vs-required policy. |
| `src/platform/ai/skills/compile.ts` | `compileFullPrompt` — text + SHA-256 hash for `PromptVersion`. |
| `src/platform/ai/providers/provider.ts` | `AiProvider` interface. |
| `src/platform/ai/providers/select.ts` | Selects provider based on `MOCKS` and key availability. |
| `src/platform/ai/providers/anthropic.ts` | Real adapter — `messages.parse` + `zodOutputFormat`, per-model params. |
| `src/platform/ai/providers/mock.ts` | Deterministic fixture-based mock; honours `AI_MOCK_FAIL`. |
| `src/platform/ai/providers/retry.ts` | Exponential backoff on 429/5xx/overload with Retry-After. |
| `src/platform/ai/providers/circuit-breaker.ts` | Per-provider breaker; opens after 5 failures for 60s. |
| `src/platform/ai/run-task.ts` | The core `runTask` implementation. |
| `src/platform/ai/stream-task.ts` | `streamTask` — Wave-1 wraps `runTask` in a ReadableStream. |
| `src/platform/ai/batch.ts` | `runBatch` / `getBatchResults` — mock-mode in-memory; live-mode deferred. |
| `src/platform/ai/prompt-versions.ts` | Publish (eval-gated), activate, list, diff. |
| `src/platform/ai/reporting.ts` | `getUsageSummary({ from, to, groupBy })`, `getCostPerOutcome`. |
| `src/platform/ai/platform-tasks/summarize-company.ts` | Worked-example task registered by the service. |
| `src/platform/ai/platform-tasks/eval-judge.ts` | Judge task used by the eval runner for rubric cases. |
| `src/platform/ai/platform-tasks/index.ts` | Idempotent registration entry point. |
| `src/platform/ai/*.test.ts` | Unit tests: pricing, citations, PII. |
| `runtime-skills/_shared/futureuni-voice/SKILL.md` | Brand voice, banned phrases, INV-5, INV-17. |
| `runtime-skills/platform/summarize-company/{SKILL.md,references/*,examples/*}` | Task's on-disk skill. |
| `runtime-skills/platform/eval-judge/{SKILL.md,examples/*}` | Judge task's on-disk skill. |
| `evals/_runner/{types,loader,checks,run,report,cli}.ts` | Eval harness; `pnpm evals` entry point. |
| `evals/platform/summarize-company/cases/01..06-*.json` | 6 cases including the injection-attempt case. |
| `evals/platform/summarize-company/fixtures/default.json` | Mock provider's deterministic output. |
| `evals/platform/eval-judge/{cases,fixtures}/*` | Judge sanity case + mock output. |
| `package.json` | Added `evals` script (only change to package.json under the alsoAllow grant). |

## Public interfaces other phases can use

All are typed by `@/contracts/ai-service`; concrete values live in `@/platform/ai`.

```ts
// @/platform/ai
export const runTask: RunTask;                                  // core call
export const streamTask: StreamTask;                            // UI drafting; ReadableStream<StreamTaskEvent>
export const runBatch: RunBatch;
export const getBatchResults: GetBatchResults;

export const registerTask: RegisterTask;                        // usually via a module manifest's aiTasks
export const defineTask: DefineTask;
export const getTask: GetTask;                                  // throws NOT_FOUND
export function listRegisteredTaskIds(): readonly TaskId[];
export function bootRegistry(): void;                           // idempotent

export const assertClaimsCited: AssertClaimsCited;              // INV-5
export const stripCitationMarkers: StripCitationMarkers;
export const CITATION_MARKER: RegExp;

export const publishPromptVersion: PublishPromptVersion;         // needs platform.prompt.publish
export const activatePromptVersion: ActivatePromptVersion;       // needs platform.prompt.activate
export function listPromptVersions(task: TaskId): Promise<PromptVersionRow[]>;
export function diffPromptVersions(task: TaskId, a: number, b: number): Promise<{ a: string; b: string }>;
export const EVAL_REGRESSION_TOLERANCE: number;
export function setEvalHookForTesting(hook: EvalHook): void;

export function getUsageSummary(args: { actor; from; to; groupBy }): Promise<UsageBucket[]>;   // platform.aiUsage.read
export function getCostPerOutcome(args: { actor; from; to }): Promise<{ outcome; calls; costMicros }[]>;
```

**AI tasks registered by this phase:**

- `platform.summarize-company` (balanced tier) — worked example.
- `platform.eval-judge` (fast tier) — invoked by the eval runner for rubric cases.

**Events emitted (via the console today, via Phase 6's publisher after Wave-1 merge):**

- `ai.budget.warning` — payload `{ scope, usedMicros, limitMicros, percent }`.
- `ai.budget.exceeded` — same shape minus `percent`.

**Permissions this phase requires (registered at Wave-1 merge, see REQUESTS.md):**

- `platform.prompt.publish`, `platform.prompt.activate`, `platform.prompt.read`,
  `platform.aiUsage.read`, `platform.aiBudget.update`, `platform.eval.run`.

**Settings this phase reads (registered at Wave-1 merge, see REQUESTS.md):**

- `ai.modelTiers`, `ai.fallbackModels`, `ai.budgets.*`, `ai.logContentOverrides`,
  `platform.retention.aiContentDays`.

**Package script added:** `pnpm evals [taskId] [--version N] [--live]`.

## Decisions made (and any new ADRs proposed)

- **Native structured output.** The SDK's `messages.parse` + `zodOutputFormat` was
  verified to exist in `@anthropic-ai/sdk@0.128.0` via `node_modules/@anthropic-ai/sdk/helpers/zod.d.ts`.
  Adopting it means no `zod-to-json-schema` dependency and no tool-use-as-JSON-shim.
- **Task discovery.** Phase 5 does NOT add a new codegen step. Tasks are attached to
  module manifests via `ModuleManifest.aiTasks[]` (already in `@/contracts/module-manifest`)
  and discovered via `getAllAiTasks()` from `@/platform/registry` (Phase 2). Platform
  tasks additionally register themselves at module load via `registerPlatformTasks()`.
- **`AiCall.promptVersion=0` for pre-publish.** The contract's `RunTaskResult.promptVersion`
  is a required `number`. When a task has no published `PromptVersion` yet, we log
  `0` on `RunTaskResult` and log the underlying column as `null` (`Int?`), and once
  a version is published, subsequent calls log the resolved active version.
- **Batches — mock-only in Wave-1.** `runBatch` is fully wired for mock mode; the live
  Anthropic Message Batches path is deferred until Phase 11 needs it (re-scoring 500
  leads). The mock path completes synchronously and returns `status: "ENDED"`, which
  keeps callers correct without paying integration cost today.
- **Circuit breaker + retry defaults.** 5 consecutive failures → open for 60s (one
  probe on half-open). Exponential backoff: 300 ms base, 15 s cap, ±20% jitter, up to
  4 attempts.

**Proposed doc updates** (via REQUESTS.md, applied at merge on `main`): ADR-018 min
cacheable prefix is 512 tokens (not 4096); `.env.example` defaults refreshed to
`claude-opus-5-5` / `claude-sonnet-5-5` / `claude-haiku-4-5`; Haiku 4.5 retirement watch
added to Phase 21's runbook.

## Dependencies added

None. The gateway uses `@anthropic-ai/sdk@0.128.0` (installed by Phase 1),
`zod@^4.6.5` and `dotenv` (both already installed). No `zod-to-json-schema`, no
`sharp`. Two optional bumps are proposed in `REQUESTS.md` (CR-05-06, CR-05-07).

## Change requests raised

Full detail in `phases/05/REQUESTS.md`. Summary:

- **CR-05-01..04** — Seam wirings (all 4 SEAMs are stubbed; wire at Wave-1 merge).
- **CR-05-05** — Register `ai.budget-warning` / `ai.budget-exceeded` notification types
  in Phase 6's notification-router.
- **CR-05-06** — Optional bump: `@anthropic-ai/sdk` 0.128 → 0.129.
- **CR-05-07** — Add `sharp` when Phase 10 lands large captures.
- **CR-05-08** — ADR-018 min cacheable prefix correction (4096 → 512 tokens).
- **CR-05-09** — Refresh `.env.example` model-id defaults.
- **CR-05-10** — Haiku 4.5 retirement watch (no sooner than 2026-10-15).
- **CR-05-11** — Add explicit vitest integration tests once real seams land.

**Seams:** all four SEAMs (SEAM-AI-CREDENTIALS, SEAM-SETTINGS-AI, SEAM-PERMISSION,
SEAM-AUDIT) are **stubbed** — the providing phases (3 and 6) are running in parallel.

## Verified model + pricing table

Verified against `https://platform.claude.com/docs/en/about-claude/models/overview`
and `.../about-claude/pricing` on 2026-09-29.

| Tier default | API ID | Input $/MTok | Output $/MTok | Cache-read × input | Cache-write 5m / 1h | Batch discount | `effort` | Retirement not before |
|---|---|---|---|---|---|---|---|---|
| fast | `claude-haiku-4-5` | 1 | 5 | 0.10× | 1.25× / 2× | 0.5× | no (classic thinking) | 2026-10-15 |
| balanced | `claude-sonnet-5-5` | 2 | 10 | 0.10× | 1.25× / 2× | 0.5× | yes | 2027-09-28 |
| deep | `claude-opus-5-5` | 4 | 20 | 0.05× | 1.25× / 2× | 0.5× | yes (adaptive always-on) | 2027-09-22 |

Legacy models kept callable via config: `claude-opus-5`, `claude-sonnet-5`,
`claude-fable-5-1`.

## Known limitations

- **Live batches deferred.** `runBatch` in `MOCKS=false` throws
  `AI_PROVIDER_ERROR("Live Message Batches path not enabled in Wave-1")`; wire the real
  path when Phase 11 needs it (re-scoring 500 leads at once).
- **Streaming is a wrapper.** `streamTask` emits one delta with the full output text
  and then the final event; Wave-2 will consume `client.messages.stream` for
  incremental UI drafting (Phase 12's `outreach-draft-edit`).
- **Vision downscaling not built in.** Images are forwarded unchanged; add `sharp` and
  a 1568-px longest-side cap in the anthropic adapter when Phase 10 needs it.
- **Cache-write cost split.** The mock provider only reports one `cacheWriteTokens`
  aggregate; the anthropic adapter reads `cache_creation_input_tokens` (5m cache) but
  cannot split 5m/1h from `Message.usage` in SDK 0.128. `computeCostMicros` treats
  the whole write as 5m (the cheaper of the two) — conservative. Bumping to SDK 0.129
  exposes the split; see CR-05-06.
- **Prompt-version `authorId`.** For SYSTEM actors we use the literal `"system"` for
  `PromptVersion.authorId`; when Phase 3 replaces SEAM-PERMISSION the eventual publish
  UI should require a real user actor.
- **Integration tests deferred.** Wave-1 relies on the eval suite as the primary
  end-to-end test. See CR-05-11.
- **Console-based event emission.** Budget warnings and exceeded events currently log
  a structured line via `console.warn` / `console.error`; Wave-1 merge replaces this
  with Phase 6's event publisher (CR-05-05).

## How to test it

Prereqs: local PostgreSQL 18 running (`pnpm db:up`), `.env.local` filled by
`node scripts/env-init.mjs`, and the phase-05 worktree checked out.

```bash
# Type + lint + tests + build (the CI gate).
pnpm check                            # → 469 unit tests pass, lint 0, build ok

# Run the platform's worked-example eval suite in mock mode.
pnpm evals platform.summarize-company # → 6/6 pass; cost ≈ $0.03

# Run the whole registered task set in mock mode.
pnpm evals

# Ownership check (runs in CI too).
node scripts/ownership/check.mjs --phase-diff

# Live evals (real API — requires ANTHROPIC_API_KEY, EVALS_LIVE_MAX_USD caps spend).
pnpm evals platform.summarize-company --live
```

Manual smoke — call the service from a repl or a temporary script inside the worktree:

```ts
import { runTask } from "@/platform/ai";
const result = await runTask({
  task: "platform.summarize-company",
  input: {
    company: { name: "Acme", market: "NG" },
    signals: [
      { id: "sig1000000000000000000000000", kind: "site-fact", text: "…" },
      { id: "sig2000000000000000000000000", kind: "job-post", text: "…" },
    ],
  },
  actor: { type: "SYSTEM", job: "manual.smoke" },
});
console.log(result.output, result.usage, result.callId);
```

After the call, `SELECT * FROM ai_calls ORDER BY "createdAt" DESC LIMIT 1;` shows one
row with the correct task id, model, tokens and `costMicros` (INV-13, US-17 AC-17.1).
