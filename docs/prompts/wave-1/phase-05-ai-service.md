# Phase 5: Claude Service Layer

> **How to run this phase**
> 1. Wave 0 must be merged, and Part A of `wave-1-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 05 ai-service`, then open Claude Code in the new worktree folder. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-05-ai-service.md and execute it. Plan first."**
>
> Wave 1. Runs in parallel with Phases 3, 4 and 6. Depends on Phases 0–2.

---

## Your role and the goal of this phase

You are building the **single gateway through which the entire platform uses Claude**, following the `saas-ai` skill. Every AI feature in every module goes through here. That includes:

- lead briefs
- audit reasoning
- vision checks
- borderline scoring reviews
- outreach drafts
- reply classification
- proposal drafts
- future Marketing features

No other code imports the Anthropic SDK; lint already enforces this.

**By the end:**

- A module can run an AI task with one call.
- The call runs from a versioned runtime skill.
- The output is validated against a Zod schema and repaired once if invalid.
- Everything is logged with cost.
- Quotas and budget caps stop runaway spend.
- Mock mode gives deterministic results, so the whole platform works without an API key.
- An eval harness lets you prove a prompt change is an improvement before publishing it.

---

## Step 0: Read first

1. `CLAUDE.md` and `.claude/project-rules.md`, especially invariant 13 (AI call logging, no secrets or unnecessary PII in prompts) and invariant 5 (claims must cite evidence)
2. `docs/contracts/ai-service.md` and `src/contracts/ai-service.ts`: implement this contract exactly
3. `docs/specs/module-acquisition.md`: identify every AI task the module needs, so the registry and the evals plan cover them
4. `docs/decisions.md`: the AI model config ADR
5. The Prisma models `AiCall` and `PromptVersion`
6. `phases/00..02/SUMMARY.md` and the seams in `docs/prompts/wave-1-prep-and-merge.md`
7. The global skill **`saas-ai` in full** (the provider adapter, structured output, safety and cost, streaming UI), plus `saas-api`, `saas-testing` and `saas-review`

Use Context7 to check the **current** Anthropic TypeScript SDK and API docs. Check these specifically:

- Messages API
- tool use and structured outputs (use the API's native structured-output or JSON-schema feature if available; otherwise tool-based extraction)
- vision input (image blocks)
- prompt caching
- streaming
- token counting
- the Batches API
- current model identifiers and pricing

Model names live in configuration, so never hardcode them. Record the current models and prices you verified, with source URLs, in `src/platform/ai/pricing.ts` and your summary.

---

## What you own

- `src/platform/ai/**`
- `runtime-skills/_shared/**`
- `evals/**`
- `phases/05/**`

Module-specific runtime skills (`runtime-skills/acquisition/**`) belong to Phase 7. You provide the loader, the conventions, the shared skill and **one example task** that proves the whole path works.

---

## Step 1: The public API (`src/platform/ai/index.ts`, server-only)

Implement the contract. The core shape:

```ts
export async function runTask<TInput, TOutput>(req: {
  task: TaskId;                         // registered task id, e.g. "acquisition.lead-brief"
  input: TInput;                        // validated against the task's inputSchema
  actor: Actor;                         // user or system job
  context?: { leadId?: string; companyId?: string; module?: string; jobRunId?: string };
  images?: Array<{ url?: string; base64?: string; mediaType: string }>;  // vision tasks only
  options?: { promptVersion?: number; maxTokens?: number; temperature?: number; timeoutMs?: number; stream?: false };
}): Promise<{ output: TOutput; usage: AiUsage; callId: string; promptVersion: number; model: string; cached: boolean }>;

export async function streamTask(...): Promise<ReadableStream>;   // for UI drafting (e.g. editing an outreach draft live)
export async function runBatch(...): Promise<BatchHandle>;        // Batches API for large non-urgent jobs (e.g. re-scoring 500 leads), if the API supports it
export function registerTask(def: TaskDefinition): void;
export function getTask(id: TaskId): TaskDefinition;
```

**`TaskDefinition`** contains:

- `id`
- `module`
- `description`
- `skillPath` (a folder under `runtime-skills/`)
- `inputSchema` and `outputSchema` (Zod)
- `modelTier` (`"fast" | "balanced" | "deep"`), mapped to real model IDs through config
- the default `maxTokens` and `temperature`
- `vision: boolean`
- `cacheableSystem: boolean`
- `piiPolicy`, which lists which input fields may contain personal data
- `evalSuite` path
- `mockFixture` path

**Task registration.** Tasks are registered by modules through a `tasks.ts` file in their own folder, discovered the same way the registry discovers manifests. Add your discovery to your own code generation step, or raise a request to extend Phase 2's registry code generation. Record the choice in your summary.

---

## Step 2: Runtime skills and prompt versions

1. **Layout.** Each task has a skill folder:

   ```
   runtime-skills/<module>/<task>/
     SKILL.md          # system instructions for this task (role, rules, output guidance)
     references/*.md   # optional reference files the loader can include
     examples/*.json   # optional few-shot input/output pairs
   ```

   plus the shared skill `runtime-skills/_shared/futureuni-voice/`, which every outreach-style task includes. It covers:
   - who FUTUREUNI is
   - its four services
   - tone
   - banned phrases
   - the "every claim must cite evidence" rule
   - the "never invent facts" rule
2. **The loader** builds the system prompt from:
   - the shared skill(s) the task declares
   - the task's `SKILL.md`
   - selected references (the loader receives a selector function, for example to load the Nigeria or International reference file based on the input's market)
   - examples

   It places stable content first so **prompt caching** applies, where the API supports it.
3. **Prompt versions.** The files are the source. Publishing creates a `PromptVersion` row containing:
   - the task
   - the version number
   - the full compiled prompt (or a content hash plus a snapshot)
   - a changelog note
   - the author
   - the eval score at publish time
   - `isActive`

   `runTask` uses the active version unless `promptVersion` is given. Rolling back means re-activating an older version.
4. **Services** (UI comes in Phase 18):
   - `publishPromptVersion(actor, task, note)`: runs the task's eval suite first and **refuses** to publish if it scores below the active version by more than a set tolerance, unless `force` is passed by an `ADMIN`
   - `listPromptVersions(task)`
   - `activatePromptVersion(actor, task, version)`
   - `diffPromptVersions(task, a, b)`

   Each checks permission through `SEAM-PERMISSION` and audits through `SEAM-AUDIT`.

---

## Step 3: Provider adapter and structured output

1. **`AiProvider` interface** with two implementations:
   - `anthropic` (the real SDK)
   - `mock`
   - Selected by `MOCKS` or settings. A third provider could be added later without changing callers.
2. **Structured output:**
   - Use the API's native structured output or JSON-schema tooling when available; otherwise tool-use extraction.
   - Validate with the task's `outputSchema`.
   - On failure, make **one repair attempt** that sends back the validation issues.
   - A second failure throws `AppError("AI_OUTPUT_INVALID")` and is logged with its outcome.
3. **Evidence enforcement helper.** For tasks whose output contains claims, like outreach drafts or briefs, provide `assertClaimsCited(output, allowedEvidenceIds)`. It fails when a claim references an ID not in the input evidence, or has no citation. Phase 12 uses it to enforce invariant 5.
4. **Vision:**
   - Accepts image URLs (Vercel Blob) or base64.
   - Enforces size and type limits.
   - Downscales large images before sending, if needed.
5. **Resilience:**
   - a timeout per task
   - retry with exponential backoff on 429, 5xx and overload errors, respecting `retry-after`
   - a circuit breaker that pauses calls for a short window after repeated provider failures
   - a model fallback within the same tier if the primary model is unavailable, if the config lists one
6. **Mock provider:**
   - Returns deterministic fixtures from each task's `mockFixture`, keyed on a hash of the input, with a default fixture when there's no match.
   - Simulates latency and token usage.
   - Can simulate failures (`AI_MOCK_FAIL=invalid|timeout|429`) so error paths are testable.

---

## Step 4: Usage logging, cost, quotas and budgets

1. **Every call writes an `AiCall` row** containing:
   - task, prompt version, model, provider
   - actor
   - context IDs
   - input, output and cache tokens
   - cost in USD minor units, computed from `pricing.ts`
   - latency
   - outcome (`ok`, `repaired`, `invalid`, `timeout`, `error`, `quota_blocked`)
   - an error code

   **The prompt and response text are not stored by default.** A per-task `logContent: "none" | "redacted" | "full"` setting (default `"none"`; `"redacted"` strips emails and phone numbers) supports debugging and is recorded in the row.
2. **PII minimisation:** before sending, the task's `piiPolicy` removes input fields that aren't allowed. For example, a contact's personal email isn't needed to write a company brief.
3. **Quotas and budgets,** read through `SEAM-SETTINGS-AI`, each with defaults:
   - a daily and a monthly **platform budget** in USD
   - a per-module daily budget
   - a per-user daily call count
   - a per-task maximum tokens value

   When a limit is reached, calls fail fast with `AppError("AI_QUOTA_EXCEEDED")`, logged as `quota_blocked`. At 80% of a budget, a warning notification event is emitted for admins. Emit it through the events contract and let Phase 6 deliver it; until the merge, log it.
4. **Reporting services** for Phase 18's AI usage screen:
   - `getUsageSummary({ from, to, groupBy: "task" | "module" | "user" | "model" | "day" })`
   - `getCostPerOutcome(...)`, a hook for "AI cost per won deal", which Phase 17 completes

---

## Step 5: Seams (fixed signatures)

```ts
// src/platform/ai/_seams.ts
// SEAM:SEAM-AI-CREDENTIALS
export async function getProviderKey(provider: "anthropic"): Promise<string | null>;   // stand-in: env ANTHROPIC_API_KEY

// SEAM:SEAM-SETTINGS-AI
export async function getAiSettings(): Promise<{
  modelTiers: { fast: string; balanced: string; deep: string };   // stand-in: env AI_MODEL_FAST / AI_MODEL_BALANCED / AI_MODEL_DEEP
  budgets: { platformDailyUsd: number; platformMonthlyUsd: number; perModuleDailyUsd: Record<string, number>; perUserDailyCalls: number };
  logContentOverrides: Record<string, "none" | "redacted" | "full">;
}>;

// SEAM:SEAM-PERMISSION
export function assertCan(actor: Actor, action: PermissionAction, resource?: PermissionResource): void;  // stand-in: allow ADMIN, deny others for ai.* admin actions

// SEAM:SEAM-AUDIT  (same signature as Phase 3's)
export async function recordAudit(tx: Tx | null, entry: {...}): Promise<void>;  // stand-in: writes AuditLog directly
```

Write each seam's wiring change in `phases/05/REQUESTS.md`. Add the AI settings keys and their Zod schema to the request too, so Phase 6's settings store registers them at merge.

---

## Step 6: The eval harness (`evals/`)

1. **Structure:**

   ```
   evals/<module>/<task>/cases/*.json
   ```

   Each case holds an input, plus expectations:
   - schema validity, which is always checked
   - exact-match fields
   - "must mention" and "must not mention" lists
   - evidence IDs that must be cited
   - banned phrases
   - an optional **rubric** scored by an LLM judge (a separate `platform.eval-judge` task with its own skill)
2. **Runner:** `pnpm evals [task] [--version N] [--live]`.
   - Mock mode by default, for CI plumbing checks.
   - `--live` uses the real API with a spend cap.
   - Prints a per-case table and an overall score, and writes a JSON report to `evals/reports/`.
3. **CI:** mock-mode evals run in CI to catch broken schemas and fixtures. Live evals are run by hand before publishing.
4. **The example task, to prove the full path:** register `platform.summarize-company`.
   - Input: company facts plus signals with evidence IDs.
   - Output: a 2–3 sentence summary plus the cited evidence IDs.
   - It needs a skill folder, a mock fixture, and 6 eval cases, including one with an injection attempt in the input ("ignore previous instructions…") that must be treated as data.
   - Run it end to end in mock mode, and live if an API key is present.

---

## Step 7: Safety

Follow `saas-ai`:

- **Untrusted content is data, never instructions.** Scraped website text, reviews, social posts and email replies are wrapped in clearly delimited data blocks, and the system prompt tells the model to treat them only as data.
- **No tool use on untrusted input** in this phase. If tools are added later, each tool checks permissions on the server with the calling actor's rights.
- Output that will be shown in the UI is treated as untrusted text: escaped, no HTML execution.
- API keys are only ever read on the server, never logged, and never sent to the client.

---

## Step 8: Tests

- **Unit tests:**
  - the skill loader (composition order, reference selection by market, the cache split point)
  - input and output validation, and the repair path
  - the PII filter
  - cost calculation
  - quota enforcement at the boundaries
  - the retry/backoff and circuit breaker, with fake timers
  - `assertClaimsCited`
- **Integration tests,** mock provider plus the database:
  - `runTask` writes a correct `AiCall` row for each outcome
  - publishing a prompt version runs evals and blocks a regression
  - rolling back works
- **No real network in tests** (MSW enforces this).

---

## Constraints

- **Don't import Phase 3, 4 or 6 code.** Use the seams.
- **No UI.** Phase 18 builds the prompt-version and AI-usage screens from your services.
- **Model IDs and prices come from config or verified docs,** never from memory.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] `runTask`, `streamTask`, `registerTask` and `getTask` are implemented exactly as the contract says. `runBatch` is too, if the API supports batches.
- [ ] The runtime skill loader, the shared `futureuni-voice` skill, and prompt versioning with publish (eval-gated), activate, rollback and diff all work.
- [ ] Structured output with one repair attempt, the evidence-citation helper, vision support, and resilience (timeouts, retries, circuit breaker, fallback) all work.
- [ ] Every call is logged with cost. The PII filter, quotas and budgets are enforced, and the reporting services exist.
- [ ] The mock provider is deterministic and supports failure simulation.
- [ ] The eval harness runs, and the example task passes its evals in mock mode (and live, if a key is present).
- [ ] The seams have stand-ins with fixed signatures and `// SEAM:` markers. `phases/05/REQUESTS.md` lists the wiring and the settings keys.
- [ ] `src/platform/ai/README.md` explains, with one full example, how a module adds a new AI task: skill folder, `tasks.ts`, schemas, fixture and evals. Phases 7–14 will follow it.
- [ ] `pnpm check` passes, and the mock evals pass in CI.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/05/SUMMARY.md` is written, including the verified model IDs and prices with source links.
