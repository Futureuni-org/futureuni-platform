"use workflow";

/**
 * `platform.run-job` — the one Vercel Workflow entry every job runs through.
 *
 * The workflow only orchestrates; all side effects (database, dynamic imports, etc.) live inside
 * the step function `executeJob`, which is tagged `"use step"` and lives in its own file so the
 * workflow bundler doesn't trace Node dependencies at the workflow level.
 */

import { executeJob, type RunJobInput } from "./run-job.step";

export async function runJobWorkflow(payload: RunJobInput): Promise<{ counts?: Record<string, number>; summary?: string }> {
  return executeJob(payload);
}

export type { RunJobInput };
