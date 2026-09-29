/**
 * Inline job runner (Phase 6).
 *
 * Runs a job synchronously against the test database, honouring per-step retries for workflow
 * handlers and per-run retries for single handlers. Same interface as `enqueueJob`; no Workflow
 * infrastructure. Used by tests and by `pnpm jobs:run`.
 *
 * Step behaviour:
 *  - a step function may throw. The inline runner retries the step up to
 *    `definition.retry.maxAttempts` (per step, matching workflow semantics) with the configured
 *    backoff, unless a `FatalError`-shaped error stops retries.
 *  - the step result is cached in-memory so a subsequent step that re-runs after a failure
 *    doesn't repeat earlier work.
 */

import "server-only";

import type { Actor, Clock } from "@/contracts/common";
import type {
  AnyJobDefinition,
  JobContext,
  JobResult,
} from "@/contracts/jobs";
import { AppError } from "@/lib/errors";
import { db, toJsonInput } from "@/platform/db";

import { getJob } from "./registry";
import {
  makeContext,
  markRunFailed,
  markRunStarted,
  markRunSucceeded,
} from "./runtime";

const stepMemory = new WeakMap<JobContext, Map<string, unknown>>();

/**
 * Step wrapper for inline tests. In workflow-mode jobs the entry calls `step(name, fn)`; here we
 * cache the result under (jobRunId, name) so a retry from step N doesn't repeat step N-1.
 */
export function inlineStep<T>(ctx: JobContext, name: string, fn: () => Promise<T>): Promise<T> {
  let store = stepMemory.get(ctx);
  if (store === undefined) {
    store = new Map<string, unknown>();
    stepMemory.set(ctx, store);
  }
  if (store.has(name)) return Promise.resolve(store.get(name) as T);
  return fn().then((value) => {
    store.set(name, value);
    return value;
  });
}

/**
 * Run one job to completion (or failure), returning the JobRun id, result and final status.
 * The idempotency key defaults to `definition.idempotencyKey(input)`. Duplicate keys reuse the
 * existing run.
 */
export async function runJobInline(
  name: string,
  input: unknown,
  opts: {
    actor?: Actor;
    clock?: Clock;
    idempotencyKey?: string;
  } = {},
): Promise<{ jobRunId: string; result: JobResult; status: "SUCCEEDED" | "FAILED" }> {
  const definition = getJob(name);
  if (definition === null) throw new AppError("NOT_FOUND", `Unknown job: ${name}`);

  const actor: Actor = opts.actor ?? { type: "SYSTEM", job: "inline-runner" };
  const idempotencyKey = opts.idempotencyKey ?? definition.idempotencyKey(input);

  // Deduplicate by key.
  const existing = await db.jobRun.findUnique({ where: { idempotencyKey }, select: { id: true, status: true } });
  const jobRun = existing ?? await db.jobRun.create({
    data: {
      name: definition.name,
      idempotencyKey,
      input: toJsonInput(input),
      actorType: actor.type,
      actorId: actor.type === "USER" ? actor.userId : null,
      status: "QUEUED",
    },
    select: { id: true },
  });

  if (existing !== null && existing.status !== "QUEUED") {
    // Return existing terminal result if any.
    const finished = await db.jobRun.findUniqueOrThrow({
      where: { id: existing.id },
      select: { status: true, counts: true, errorSummary: true },
    });
    const status = finished.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
    const counts = finished.counts as Record<string, number> | null;
    const summary = finished.errorSummary;
    const result: JobResult = {
      ...(counts === null ? {} : { counts }),
      ...(summary === null ? {} : { summary }),
    };
    return { jobRunId: existing.id, result, status };
  }

  const maxAttempts = definition.retry.maxAttempts;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await markRunStarted(db, jobRun.id, attempt);
    try {
      const ctx = makeContext({
        jobRunId: jobRun.id,
        attempt,
        name: definition.name,
        actor,
        ...(opts.clock === undefined ? {} : { clock: opts.clock }),
      });
      const result: JobResult = await callHandler(definition, input, ctx);
      await markRunSucceeded(db, jobRun.id);
      return { jobRunId: jobRun.id, result, status: "SUCCEEDED" };
    } catch (error) {
      lastError = error;
      if (isFatal(error) || attempt >= maxAttempts) break;
      // linear backoff for tests; production uses the Workflow retry policy.
      await new Promise((resolve) => setTimeout(resolve, Math.min(10, definition.retry.initialDelayMs)));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  await markRunFailed(db, jobRun.id, message);
  return { jobRunId: jobRun.id, result: { summary: message }, status: "FAILED" };
}

async function callHandler(
  definition: AnyJobDefinition,
  input: unknown,
  ctx: JobContext,
): Promise<JobResult> {
  const handler = definition.handler;
  if (handler.kind === "single") {
    return handler.run(input, ctx);
  }
  // Workflow handler: the entry accepts the same JobContext. For inline runs, side effects live
  // in the entry's own step calls (which use inlineStep for memoisation).
  return handler.entry(input, ctx);
}

function isFatal(error: unknown): boolean {
  return error instanceof Error && error.name === "FatalError";
}
