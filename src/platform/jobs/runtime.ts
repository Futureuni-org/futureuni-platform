/**
 * Job runtime shared between the Vercel Workflow adapter and the inline test runner.
 *
 * A `JobContext` reports progress, adds to `counts`, aborts on cancel, and carries the actor and
 * clock. `JobLogger` is a PII-free structured logger (saas-ship): no personal data, only IDs.
 */

import "server-only";

import type { Actor, Clock } from "@/contracts/common";
import type {
  JobContext,
  JobCounts,
  JobLogger,
  JobProgress,
} from "@/contracts/jobs";
import { db, toJsonInput, type Tx } from "@/platform/db";

const DEFAULT_CLOCK: Clock = { now: () => new Date() };

export function makeLogger(jobRunId: string, name: string): JobLogger {
  const base = { jobRunId, name };
  const write = (level: "info" | "warn" | "error", msg: string, data?: Record<string, unknown>): void => {
    const line = JSON.stringify({ level, ...base, msg, ...(data ?? {}) });
    if (level === "error") console.error(line);
    else console.warn(line);
  };
  return {
    info: (msg, data) => { write("info", msg, data); },
    warn: (msg, data) => { write("warn", msg, data); },
    error: (msg, data) => { write("error", msg, data); },
  };
}

export interface CtxOptions {
  jobRunId: string;
  attempt: number;
  name: string;
  actor: Actor;
  clock?: Clock;
  signal?: AbortSignal;
}

export function makeContext(opts: CtxOptions): JobContext {
  const abortController = new AbortController();
  if (opts.signal !== undefined) {
    if (opts.signal.aborted) abortController.abort();
    else opts.signal.addEventListener("abort", () => { abortController.abort(); });
  }
  const logger = makeLogger(opts.jobRunId, opts.name);
  return {
    jobRunId: opts.jobRunId,
    attempt: opts.attempt,
    actor: opts.actor,
    clock: opts.clock ?? DEFAULT_CLOCK,
    signal: abortController.signal,
    log: logger,
    progress: async (partial) => {
      await updateProgress(opts.jobRunId, partial);
    },
    count: async (counts) => {
      await mergeCounts(opts.jobRunId, counts);
    },
  };
}

async function updateProgress(jobRunId: string, partial: Omit<JobProgress, "updatedAt">): Promise<void> {
  const progress = { ...partial, updatedAt: new Date().toISOString() };
  await db.jobRun.update({
    where: { id: jobRunId },
    data: { progress: toJsonInput(progress) },
  });
}

async function mergeCounts(jobRunId: string, add: JobCounts): Promise<void> {
  const row = await db.jobRun.findUnique({ where: { id: jobRunId }, select: { counts: true } });
  const before = (row?.counts ?? {}) as Record<string, number>;
  const next: Record<string, number> = { ...before };
  for (const [key, value] of Object.entries(add)) next[key] = (next[key] ?? 0) + value;
  await db.jobRun.update({
    where: { id: jobRunId },
    data: { counts: toJsonInput(next) },
  });
}

// ---- JobRun lifecycle helpers ------------------------------------------------

export type TxOrDb = Tx | typeof db;

export async function markRunStarted(client: TxOrDb, jobRunId: string, attempt: number): Promise<void> {
  await client.jobRun.update({
    where: { id: jobRunId },
    data: { status: "RUNNING", attempt, startedAt: new Date() },
  });
}

export async function markRunSucceeded(client: TxOrDb, jobRunId: string): Promise<void> {
  await client.jobRun.update({
    where: { id: jobRunId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), errorSummary: null },
  });
}

export async function markRunFailed(client: TxOrDb, jobRunId: string, errorSummary: string): Promise<void> {
  await client.jobRun.update({
    where: { id: jobRunId },
    data: { status: "FAILED", finishedAt: new Date(), errorSummary: errorSummary.slice(0, 500) },
  });
}

export async function markRunCancelled(client: TxOrDb, jobRunId: string): Promise<void> {
  await client.jobRun.update({
    where: { id: jobRunId },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
}
