/**
 * Contract: jobs, workflows and schedules (docs/contracts/jobs.md). Implemented by Phase 6
 * (@/platform/jobs, the cron tick and the workflow routes); declared by module manifests.
 */

import { z } from "zod";

import {
  ActorSchema,
  IanaTimezoneSchema,
  IdSchema,
  Iso8601Schema,
  JobStatusSchema,
  type Actor,
  type Clock,
} from "./common";

/** "<module>.<job-name>" or "<module>.<area>.<job-name>", e.g. "acquisition.enrichment.lead", "platform.retention-purge". */
export const JobNameSchema = z
  .string()
  .regex(/^[a-z]+(\.[a-z0-9-]+){1,2}$/, { error: "Use <module>.<job-name>" });
export type JobName = z.infer<typeof JobNameSchema>;

/** Named integer counters reported by a run, e.g. { found: 42, created: 17 }. Stored in JobRun.counts. */
export const JobCountsSchema = z.record(
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  z.int().nonnegative(),
);
export type JobCounts = z.infer<typeof JobCountsSchema>;

/** Live progress, stored in JobRun.progress and shown by the job monitor and the search run panel. */
export const JobProgressSchema = z.object({
  step: z.string().max(80).optional(), // current step name, e.g. "google-places"
  message: z.string().max(280).optional(),
  done: z.int().nonnegative().optional(),
  total: z.int().nonnegative().optional(),
  updatedAt: Iso8601Schema,
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

export const RetryPolicySchema = z.object({
  maxAttempts: z.int().min(1).max(10).default(3), // per step for workflow handlers; per run for single handlers
  backoff: z.enum(["exponential", "fixed"]).default("exponential"),
  initialDelayMs: z.int().min(0).default(2_000),
  maxDelayMs: z.int().min(0).default(300_000),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export interface JobContext {
  jobRunId: string;
  attempt: number; // 1-based
  actor: Actor; // who enqueued it; SYSTEM for schedules
  clock: Clock; // injectable now() (wave-3 B4)
  signal: AbortSignal; // cancelled by cancelJob() or timeout
  progress(p: Omit<JobProgress, "updatedAt">): Promise<void>;
  count(counts: JobCounts): Promise<void>; // merged (added) into JobRun.counts
  log: JobLogger; // structured, PII-free (saas-ship logging rules)
}

export interface JobLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export interface JobResult {
  counts?: JobCounts;
  summary?: string;
}

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
      /**
       * The "use workflow" function itself. defineJob keeps it as is (the Workflow build tags the
       * function, and start() needs that exact reference); its input is parsed at enqueue (rule
       * 10). Method syntax, so a typed entry widens to the erased definition without a cast.
       */
      entry(input: TInput, ctx: JobContext): Promise<JobResult>;
      steps: readonly string[];
    };

export interface JobDefinition<TInput = unknown> {
  name: JobName;
  description: string; // one sentence, shown in /admin/jobs
  input: z.ZodType<TInput>;
  handler: JobHandler<TInput>;
  concurrency: number; // max parallel runs of this job; default 1 for scheduled jobs
  timeoutMs: number; // hard cap per run (or per step for workflows); within Vercel limits
  retry: RetryPolicy;
  idempotencyKey: (input: TInput) => string; // deterministic; the dispatcher prefixes schedule slots itself
  allowManualRun?: boolean; // "Run now" in /admin/jobs (platform.job.runNow)
  notifyOnFailure?: boolean; // emits job.failed → notification job.failed (default true)
  systemActions?: readonly string[]; // PermissionActions its services perform as the SYSTEM actor (assertActorCan, permissions.md rule 10)
}

/**
 * Type-erased job definition, as manifests and area `jobs.ts` files export them. Produced only by defineJob<T>()
 * (implemented in src/platform/registry by Phase 2). Its `run` and `idempotencyKey` parse `input` with the job's own
 * schema first; a workflow `entry` is kept as is and receives input parsed at enqueue (rule 10). No `any` needed.
 */
export type AnyJobDefinition = JobDefinition;
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
  id: z.string().regex(/^[a-z0-9-]+$/), // unique per module
  job: JobNameSchema,
  cron: z.string().min(9).max(100), // 5-field cron; validated with a cron parser at registry generation
  timezone: IanaTimezoneSchema.default("Africa/Lagos"),
  input: z.unknown().optional(), // must satisfy the job's input schema
  description: z.string().max(200).optional(),
});
export type CronSchedule = z.infer<typeof CronScheduleSchema>;

/** Schedules computed at tick time, e.g. one per enabled saved search (Phase 8's getSourcingDynamicSchedules). */
export const DynamicScheduleSchema = CronScheduleSchema.extend({
  id: z.string().min(3).max(120), // e.g. "saved-search:cm1..."
  input: z.unknown(),
  skip: z.object({ reason: z.string().max(80) }).optional(), // e.g. { reason: "capacity" }: recorded, not enqueued
});
export type DynamicSchedule = z.infer<typeof DynamicScheduleSchema>;
export type DynamicScheduleProvider = (ctx: { clock: Clock }) => Promise<DynamicSchedule[]>;

// ---- Platform API (implemented by Phase 6) ----
export const EnqueueOptionsSchema = z.object({
  actor: ActorSchema,
  idempotencyKey: z.string().min(1).max(200).optional(), // defaults to definition.idempotencyKey(input)
  runAt: Iso8601Schema.optional(), // delayed start
  parentRunId: IdSchema.optional(), // retries link to the original
});
// The doc's `<TInput>(name, input: TInput, …)` uses its type parameter once (lint:
// no-unnecessary-type-parameters), so the input is `unknown`: it's validated with the job's own
// input schema at enqueue time (rule 10).
export type EnqueueJob = (
  name: JobName,
  input: unknown,
  opts: z.infer<typeof EnqueueOptionsSchema>,
) => Promise<{ jobRunId: string; deduplicated: boolean }>;
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
export type RunJobInline = (
  name: JobName,
  input: unknown,
  opts?: { actor?: Actor; clock?: Clock },
) => Promise<{ jobRunId: string; result: JobResult; status: "SUCCEEDED" | "FAILED" }>;
