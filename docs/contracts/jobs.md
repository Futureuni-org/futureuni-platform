# Contract: Jobs, workflows and schedules

| | |
|---|---|
| Module | `src/contracts/jobs.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 6 (`@/platform/jobs`, `src/app/api/cron/tick`, `src/app/api/workflows/**`) |
| Declared by | Module manifests (`jobs`, `schedules`, `dynamicSchedules`), plus each area's exported `jobs.ts` and `schedules.ts` (wave guides, Part B3) |
| Consumers | Every phase with background work (6, 8–14, 17, 19). Phase 18 builds the job monitor screens |
| Platform | Vercel Workflow (ADR-003) for durable multi-step work, and one Vercel Cron entry (ADR-033) |

## 1. Purpose

A module declares what background work it has and when it runs. The platform starts it, records every run in `JobRun`, retries failed steps without re-running finished ones, and guarantees one run per idempotency key (INV-22). Modules never edit `vercel.json`.

## 2. Vercel Workflow facts this contract relies on

Verified with Context7 (`/vercel/workflow`) on 2026-09-25. Phase 6 re-verifies against the installed version and records any difference in its summary.

- A workflow function starts with the `"use workflow"` directive. It runs in a sandbox, so it holds orchestration only.
- A step is a function with the `"use step"` directive. Steps have full Node.js access and hold all side effects: database, network, AI and storage. A step's result is persisted, so a failed run resumes from the failed step.
- Runs start with `start(workflowFn, args)` from `workflow/api`, which returns `{ runId }`. `start()` can't be called inside a workflow except from a step.
- `FatalError` stops retries. `RetryableError(message, { retryAfter })` asks for a retry. `stepFn.maxRetries = n` sets attempts per step. `getStepMetadata().stepId` is a stable key for idempotent external writes.
- `sleep()` works only in the workflow context. `createHook()` lets a run wait for an external signal.

## 3. Types and schemas

```ts
// src/contracts/jobs.ts
import { z } from "zod";
import { IdSchema, Iso8601Schema, IanaTimezoneSchema, ActorSchema, JobStatusSchema, type Actor, type Clock } from "./common";

/** "<module>.<job-name>" or "<module>.<area>.<job-name>", e.g. "acquisition.enrichment.lead", "platform.retention-purge". */
export const JobNameSchema = z.string().regex(/^[a-z]+(\.[a-z0-9-]+){1,2}$/, { error: "Use <module>.<job-name>" });
export type JobName = z.infer<typeof JobNameSchema>;

/** Named integer counters reported by a run, e.g. { found: 42, created: 17 }. Stored in JobRun.counts. */
export const JobCountsSchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), z.int().nonnegative());
export type JobCounts = z.infer<typeof JobCountsSchema>;

/** Live progress, stored in JobRun.progress and shown by the job monitor and the search run panel. */
export const JobProgressSchema = z.object({
  step: z.string().max(80).optional(),        // current step name, e.g. "google-places"
  message: z.string().max(280).optional(),
  done: z.int().nonnegative().optional(),
  total: z.int().nonnegative().optional(),
  updatedAt: Iso8601Schema,
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

export const RetryPolicySchema = z.object({
  maxAttempts: z.int().min(1).max(10).default(3),       // per step for workflow handlers; per run for single handlers
  backoff: z.enum(["exponential", "fixed"]).default("exponential"),
  initialDelayMs: z.int().min(0).default(2_000),
  maxDelayMs: z.int().min(0).default(300_000),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export interface JobContext {
  jobRunId: string;
  attempt: number;                 // 1-based
  actor: Actor;                    // who enqueued it; SYSTEM for schedules
  clock: Clock;                    // injectable now() (wave-3 B4)
  signal: AbortSignal;             // cancelled by cancelJob() or timeout
  progress(p: Omit<JobProgress, "updatedAt">): Promise<void>;
  count(counts: JobCounts): Promise<void>;   // merged (added) into JobRun.counts
  log: JobLogger;                  // structured, PII-free (saas-ship logging rules)
}

export interface JobLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export type JobResult = { counts?: JobCounts; summary?: string };

/**
 * Two handler kinds:
 *  - "single": one function; the whole run retries as a unit (keep it idempotent).
 *  - "workflow": a Vercel Workflow entry ("use workflow") whose side effects live in "use step" functions;
 *    a failure retries from the failed step. `steps` lists step names for display and progress.
 */
export type JobHandler<TInput> =
  | { kind: "single"; run: (input: TInput, ctx: JobContext) => Promise<JobResult> }
  | {
      kind: "workflow";
      // The "use workflow" function itself: defineJob keeps it as is (the Workflow build tags it, and start() needs
      // that reference); its input is parsed at enqueue (rule 10). Method syntax, so a typed entry widens without a cast.
      entry(input: TInput, ctx: JobContext): Promise<JobResult>;
      steps: readonly string[];
    };

export interface JobDefinition<TInput = unknown> {
  name: JobName;
  description: string;                          // one sentence, shown in /admin/jobs
  input: z.ZodType<TInput>;
  handler: JobHandler<TInput>;
  concurrency: number;                           // max parallel runs of this job; default 1 for scheduled jobs
  timeoutMs: number;                             // hard cap per run (or per step for workflows); within Vercel limits
  retry: RetryPolicy;
  idempotencyKey: (input: TInput) => string;     // deterministic; the dispatcher prefixes schedule slots itself
  allowManualRun?: boolean;                      // "Run now" in /admin/jobs (platform.job.runNow)
  notifyOnFailure?: boolean;                     // emits job.failed → notification job.failed (default true)
  systemActions?: readonly string[];             // PermissionActions its services perform as the SYSTEM actor (assertActorCan, permissions.md rule 10)
}

/**
 * Type-erased job definition, as manifests and area `jobs.ts` files export them. Produced only by defineJob<T>()
 * (implemented in src/platform/registry by Phase 2). The wrapper parses `input` with the job's own schema before
 * calling the typed handler and idempotencyKey, so the widening to unknown is type-safe and needs no `any`.
 */
export type AnyJobDefinition = JobDefinition<unknown>;
export type DefineJob = <TInput>(def: JobDefinition<TInput>) => AnyJobDefinition;

/** Serializable view of a JobDefinition (what the registry validates with Zod and the admin UI lists). */
export const JobDefinitionMetaSchema = z.object({
  name: JobNameSchema,
  description: z.string().min(5).max(280),
  handlerKind: z.enum(["single", "workflow"]),
  steps: z.array(z.string()).default([]),
  concurrency: z.int().min(1).max(50),
  timeoutMs: z.int().min(1_000).max(800_000),
  retry: RetryPolicySchema,
  allowManualRun: z.boolean().default(false),
  notifyOnFailure: z.boolean().default(true),
  systemActions: z.array(z.string()).default([]),
});
export type JobDefinitionMeta = z.infer<typeof JobDefinitionMetaSchema>;

/** Static schedule declared in a manifest. Times are evaluated in `timezone`; the cron tick itself runs in UTC. */
export const CronScheduleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),          // unique per module
  job: JobNameSchema,
  cron: z.string().min(9).max(100),              // 5-field cron; validated with a cron parser at registry generation
  timezone: IanaTimezoneSchema.default("Africa/Lagos"),
  input: z.unknown().optional(),                  // must satisfy the job's input schema
  description: z.string().max(200).optional(),
});
export type CronSchedule = z.infer<typeof CronScheduleSchema>;

/** Schedules computed at tick time, e.g. one per enabled saved search (Phase 8's getSourcingDynamicSchedules). */
export const DynamicScheduleSchema = CronScheduleSchema.extend({
  id: z.string().min(3).max(120),                 // e.g. "saved-search:cm1..."
  input: z.unknown(),
  skip: z.object({ reason: z.string().max(80) }).optional(),   // e.g. { reason: "capacity" }: recorded, not enqueued
});
export type DynamicSchedule = z.infer<typeof DynamicScheduleSchema>;
export type DynamicScheduleProvider = (ctx: { clock: Clock }) => Promise<DynamicSchedule[]>;

// ---- Platform API (implemented by Phase 6) ----
export const EnqueueOptionsSchema = z.object({
  actor: ActorSchema,
  idempotencyKey: z.string().min(1).max(200).optional(),   // defaults to definition.idempotencyKey(input)
  runAt: Iso8601Schema.optional(),                          // delayed start
  parentRunId: IdSchema.optional(),                         // retries link to the original
});
// `input` is `unknown` (a single-use type parameter would be `unknown` in disguise): it's validated with the job's
// own input schema at enqueue time (rule 10).
export type EnqueueJob = (name: JobName, input: unknown, opts: z.infer<typeof EnqueueOptionsSchema>) =>
  Promise<{ jobRunId: string; deduplicated: boolean }>;
export type CancelJob = (actor: Actor, jobRunId: string) => Promise<void>;
export type RetryJob = (actor: Actor, jobRunId: string) => Promise<{ jobRunId: string }>;
export const ListJobRunsInputSchema = z.object({
  name: JobNameSchema.optional(),
  status: JobStatusSchema.optional(),
  from: Iso8601Schema.optional(),
  to: Iso8601Schema.optional(),
  cursor: z.string().optional(),
  limit: z.int().min(1).max(100).default(25),
});

/** Test and local tooling: same interface, no Workflow infrastructure. */
export type RunJobInline = (name: JobName, input: unknown, opts?: { actor?: Actor; clock?: Clock }) =>
  Promise<{ jobRunId: string; result: JobResult; status: "SUCCEEDED" | "FAILED" }>;
```

## 4. Rules

1. **Names.** A job name is `<module>.<job-name>` or `<module>.<area>.<job-name>`, unique across all manifests. The registry rejects duplicates at generation time.
2. **Every run has a `JobRun` row** with a unique `idempotencyKey`. `enqueueJob` with a key that already exists returns the existing run with `deduplicated: true` and starts nothing (INV-22).
3. **Lifecycle:** `QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED`. The framework sets `startedAt`, `attempt`, `finishedAt`, a short `errorSummary` (≤ 500 chars, no PII, no secrets), `counts` and `progress`.
4. **Workflow handlers** keep all side effects in steps. A failure in step N retries step N only. Steps that call external systems use the step ID (or a business ID such as the message ID) as their idempotency key.
5. **Scheduled runs.** A single Vercel Cron entry calls `GET /api/cron/tick` every 5 minutes (UTC). The tick verifies `Authorization: Bearer ${CRON_SECRET}` and rejects anything else. For each static and dynamic schedule that is due in the current 5-minute slot, in the schedule's timezone, it enqueues the job with the key `"<job>:<slot-iso>"`, or `"<job>:<scheduleId>:<slot-iso>"` for dynamic schedules. A duplicated tick therefore never double-runs a job.
6. **Switch-off.** The setting `jobs.<name>.enabled` (default `true`) disables a job's schedules. A manual run of a disabled job is still allowed for `ADMIN`.
7. **Dynamic schedules** come from a manifest's `dynamicSchedules` provider. A schedule with `skip` is recorded as skipped with its reason (for example a saved search on a line at capacity), not enqueued.
8. **Timeouts** stay within the current Vercel Function and Workflow step limits, which Phase 6 verifies. Long work is split into steps.
9. **Concurrency.** The framework never runs more than `concurrency` runs of one job at once. Excess runs wait in `QUEUED`.
10. **Inputs are validated** with the job's `input` schema at enqueue time. An invalid input fails with `VALIDATION_FAILED` and creates no `JobRun`.
11. **Local development.** `pnpm jobs:run <name> '<json>'` triggers a job by hand through the local Workflow runtime. Tests use `runJobInline`, which has the same semantics minus the durability.
12. **Failure.** A run that exhausts its retries ends `FAILED`, emits `job.failed`, and stays visible in `/admin/jobs` with a Retry action (`platform.job.retry`). A retry is a new run with `parentRunId`.
13. **Control** (`cancelJob`, `retryJob`, `listJobRuns`, `getJobRun`) checks permissions: `platform.job.read`, `platform.job.retry`, `platform.job.cancel`, `platform.job.runNow`.
14. **Exports.** Areas export jobs as `AnyJobDefinition[]` built with `defineJob<T>()` (wave guides, Part B3: `export const <area>Jobs: AnyJobDefinition[]`). A plain `JobDefinition<T>[]` array with a typed input doesn't type-check against the manifest, by design.
   `defineJob` wraps a single handler's `run` and the `idempotencyKey` so they parse input with the job's schema first. A workflow handler's `entry` is kept as the exact function, so the platform parses workflow input at enqueue (rule 10) before `start()`.

## 5. Worked example

```ts
// src/modules/acquisition/enrichment/jobs.ts (Phase 9)
// enrichLeadWorkflow: (input: { leadId: string }, ctx: JobContext) => Promise<JobResult>, a "use workflow" entry.
export const enrichmentJobs: AnyJobDefinition[] = [
  defineJob<{ leadId: string }>({
    name: "acquisition.enrichment.lead",
    description: "Enrich one lead: crawl, find and verify emails, run compliance, then move it to ENRICHED.",
    input: z.object({ leadId: z.cuid() }),
    handler: { kind: "workflow", entry: enrichLeadWorkflow, steps: ["crawl", "finder", "verify", "compliance", "finalise"] },
    concurrency: 5,
    timeoutMs: 120_000,
    retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
    idempotencyKey: ({ leadId }) => `acquisition.enrichment.lead:${leadId}`,
    allowManualRun: false,
    systemActions: ["acquisition.lead.update"],
  }),
];

// A manifest schedule for the batch sweeper
const schedule: CronSchedule = CronScheduleSchema.parse({
  id: "enrichment-batch", job: "acquisition.enrichment.batch", cron: "*/15 * * * *", timezone: "Africa/Lagos",
});

await enqueueJob("acquisition.enrichment.lead", { leadId: "cm1lead0000000000000000042" },
  { actor: { type: "SYSTEM", job: "acquisition.lead.advance" } });
// → { jobRunId: "cm1job...", deduplicated: false }; a second identical call → deduplicated: true
```

## 6. Invalid example (Phase 2 test)

```ts
JobDefinitionMetaSchema.safeParse({
  name: "enrichLead", description: "Run", handlerKind: "single",
  concurrency: 0, timeoutMs: 120000, retry: {},
});
// → fails: ["name"] "Use <module>.<job-name>"; ["description"] too short (min 5);
//   ["concurrency"] too small (min 1)
```
