/**
 * `enqueueJob` (Phase 6): validate the input, create-or-return a `JobRun`, and start the actual
 * work.
 *
 * Choice of runner:
 *  - In tests and in `pnpm jobs:run`, the inline runner is used (real durability isn't needed).
 *  - In dev/preview/production the platform starts a Vercel Workflow run, which owns retries,
 *    step-level idempotency and observability. Wiring to `workflow/api.start` lives in
 *    `./workflow-adapter.ts` and is called lazily so tests never import it.
 *
 * INV-22: exactly one `JobRun` per idempotency key. Two concurrent enqueues collide on the
 * unique index and the second one returns `deduplicated: true`.
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import type { EnqueueJob, JobName } from "@/contracts/jobs";
import { AppError } from "@/lib/errors";
import { db, isUniqueViolation, toJsonInput } from "@/platform/db";

import { runJobInline } from "./inline";
import { getJob } from "./registry";

interface EnqueueOptions {
  actor: Actor;
  idempotencyKey?: string;
  runAt?: string;
  parentRunId?: string;
}

export const enqueueJob: EnqueueJob = async (name, input, opts): Promise<{ jobRunId: string; deduplicated: boolean }> => {
  const definition = getJob(name);
  if (definition === null) throw new AppError("NOT_FOUND", `Unknown job: ${name}`);

  const parsed = definition.input.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.path.join(".") || "(input)"] = issue.message;
      return acc;
    }, {});
    throw new AppError("VALIDATION_FAILED", `Invalid input for job "${name}".`, { details });
  }

  const idempotencyKey = opts.idempotencyKey ?? definition.idempotencyKey(parsed.data);
  const options = opts as EnqueueOptions;

  try {
    const row = await db.jobRun.create({
      data: {
        name: definition.name,
        idempotencyKey,
        input: toJsonInput(parsed.data),
        actorType: options.actor.type,
        actorId: options.actor.type === "USER" ? options.actor.userId : null,
        parentRunId: options.parentRunId ?? null,
        runAt: options.runAt !== undefined ? new Date(options.runAt) : null,
        status: "QUEUED",
      },
      select: { id: true },
    });
    // Kick off the actual work. In production this hands off to Vercel Workflow.
    await startRun(name, parsed.data, row.id, options.actor);
    return { jobRunId: row.id, deduplicated: false };
  } catch (error) {
    if (isUniqueViolation(error, "job_runs_idempotencyKey_key") || isUniqueViolation(error)) {
      const existing = await db.jobRun.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing !== null) return { jobRunId: existing.id, deduplicated: true };
    }
    throw error;
  }
};

async function startRun(name: JobName, input: unknown, jobRunId: string, actor: Actor): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.JOBS_INLINE === "1") {
    // Fire-and-forget in the same task; tests use `runJobInline` directly for assertions.
    // Not awaited here: `enqueueJob` returns immediately, matching production semantics.
    void runJobInline(name, input, { actor }).catch(() => {
      /* the inline runner already writes JobRun.status */
    });
    return;
  }
  // Lazy import: production only.
  const { startWorkflowRun } = await import("./workflow-adapter");
  await startWorkflowRun(name, input, jobRunId, actor);
}
