/**
 * Vercel Workflow adapter for jobs (Phase 6).
 *
 * Every job — single or workflow — is started through the same `platform.run-job` workflow that
 * lives in `src/workflows/_platform/run-job.workflow.ts`. That workflow calls the definition's
 * handler in a step, so we get durable step-level retries and observability for every job.
 *
 * Kept in its own file so tests never import the `workflow/api` runtime.
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import type { JobName } from "@/contracts/jobs";

import { runJobWorkflow } from "@/workflows/_platform/run-job.workflow";

interface WorkflowStart {
  runId: string;
}

/** Start a Workflow run for `name` with `input`, writing the workflow run id onto the JobRun. */
export async function startWorkflowRun(
  name: JobName,
  input: unknown,
  jobRunId: string,
  actor: Actor,
): Promise<WorkflowStart> {
  // The workflow package's runtime API. Loaded dynamically because it is server-runtime only.
  const { start } = await import("workflow/api");
  const run = await start(runJobWorkflow, [{ name, input, jobRunId, actor }]);
  const { db } = await import("@/platform/db");
  await db.jobRun.update({ where: { id: jobRunId }, data: { workflowRunId: run.runId } });
  return { runId: run.runId };
}
