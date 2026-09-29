"use step";

/**
 * The single durable step that runs one job's handler. Isolated from the workflow file so the
 * bundler treats it as an ordinary Node step (which has full Node.js access).
 */

import type { Actor } from "@/contracts/common";
import type { JobName, JobResult } from "@/contracts/jobs";

export interface RunJobInput {
  name: JobName;
  input: unknown;
  jobRunId: string;
  actor: Actor;
}

export async function executeJob(payload: RunJobInput): Promise<JobResult> {
  const { getJob } = await import("@/platform/jobs/registry");
  const definition = getJob(payload.name);
  if (definition === null) throw new Error(`Unknown job: ${payload.name}`);

  const { makeContext, markRunFailed, markRunStarted, markRunSucceeded } = await import(
    "@/platform/jobs/runtime"
  );
  const { db } = await import("@/platform/db");

  await markRunStarted(db, payload.jobRunId, 1);
  try {
    const ctx = makeContext({
      jobRunId: payload.jobRunId,
      attempt: 1,
      name: definition.name,
      actor: payload.actor,
    });
    const handler = definition.handler;
    const result: JobResult =
      handler.kind === "single" ? await handler.run(payload.input, ctx) : await handler.entry(payload.input, ctx);
    await markRunSucceeded(db, payload.jobRunId);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markRunFailed(db, payload.jobRunId, message);
    throw error;
  }
}
