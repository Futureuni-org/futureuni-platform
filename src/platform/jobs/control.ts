/**
 * Job control services (Phase 6). `assertCanSeam` gates each one until Phase 3's real permission
 * check replaces the seam.
 */

import "server-only";

import type { Actor, JobStatus } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";
import { assertCanSeam } from "@/platform/_seams";

import { enqueueJob } from "./enqueue";
import { markRunCancelled } from "./runtime";

export interface JobRunSummary {
  id: string;
  name: string;
  status: JobStatus;
  actorType: "USER" | "SYSTEM";
  actorId: string | null;
  attempt: number;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorSummary: string | null;
  counts: Record<string, number> | null;
  parentRunId: string | null;
}

export async function getJobRun(actor: Actor, id: string): Promise<JobRunSummary | null> {
  await assertCanSeam(actor, "platform.job.read");
  const row = await db.jobRun.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      actorType: true,
      actorId: true,
      attempt: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      errorSummary: true,
      counts: true,
      parentRunId: true,
    },
  });
  if (row === null) return null;
  return { ...row, counts: (row.counts as Record<string, number> | null) ?? null };
}

export interface ListJobRunsQuery {
  name?: string;
  status?: JobStatus;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export async function listJobRuns(
  actor: Actor,
  query: ListJobRunsQuery,
): Promise<{ items: JobRunSummary[]; nextCursor: string | null }> {
  await assertCanSeam(actor, "platform.job.read");
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const rows = await db.jobRun.findMany({
    where: {
      ...(query.name === undefined ? {} : { name: query.name }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            queuedAt: {
              ...(query.from === undefined ? {} : { gte: query.from }),
              ...(query.to === undefined ? {} : { lte: query.to }),
            },
          }),
    },
    orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      status: true,
      actorType: true,
      actorId: true,
      attempt: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      errorSummary: true,
      counts: true,
      parentRunId: true,
    },
  });
  const items = rows.slice(0, limit).map((row) => ({
    ...row,
    counts: (row.counts as Record<string, number> | null) ?? null,
  }));
  const last = rows[limit - 1];
  return { items, nextCursor: rows.length > limit && last !== undefined ? last.id : null };
}

export async function cancelJob(actor: Actor, jobRunId: string): Promise<void> {
  await assertCanSeam(actor, "platform.job.cancel");
  const row = await db.jobRun.findUnique({ where: { id: jobRunId }, select: { status: true } });
  if (row === null) throw new AppError("NOT_FOUND", "Job run not found.");
  if (row.status === "SUCCEEDED" || row.status === "FAILED" || row.status === "CANCELLED") return;
  await markRunCancelled(db, jobRunId);
}

export async function retryJob(actor: Actor, jobRunId: string): Promise<{ jobRunId: string }> {
  await assertCanSeam(actor, "platform.job.retry");
  const row = await db.jobRun.findUnique({
    where: { id: jobRunId },
    select: { name: true, input: true, status: true },
  });
  if (row === null) throw new AppError("NOT_FOUND", "Job run not found.");
  if (row.status !== "FAILED" && row.status !== "CANCELLED") {
    throw new AppError("INVALID_TRANSITION", "Only failed or cancelled runs can be retried.");
  }
  // A retry gets a fresh idempotency key linked back to the original run.
  const uniqueSuffix = `retry:${jobRunId}:${Date.now().toString(36)}`;
  const enqueued = await enqueueJob(row.name, row.input, {
    actor,
    idempotencyKey: uniqueSuffix,
    parentRunId: jobRunId,
  });
  return { jobRunId: enqueued.jobRunId };
}
