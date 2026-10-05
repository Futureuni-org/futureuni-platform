/**
 * Workflow jobs (Phase 19): the per-lead advance workflow and its safety-net sweeper.
 *
 * The sweeper is the net under the event-driven advance workflow: every 30 minutes it finds leads
 * that have sat in a pre-contact status past the stuck threshold and re-queues their advance; once
 * a lead has exhausted its restarts it is flagged for manual attention (`needsAttentionAt`) and a
 * `lead.needsAttention` event is published. It never touches cross-sell-held or already-flagged
 * leads. Idempotent per 5-minute slot (INV-22).
 */

import { z } from "zod";

import type { AnyJobDefinition, JobResult } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

import { leadAdvanceJob } from "./lead-advance.job";

const SWEEPER_JOB_NAME = "acquisition.lead.advance-sweeper";

export const advanceSweeperJob: AnyJobDefinition = defineJob<{ batchSize: number }>({
  name: SWEEPER_JOB_NAME,
  description: "Re-advance leads stuck in a pre-contact status; flag the exhausted ones for attention.",
  input: z.object({ batchSize: z.int().min(1).max(500).default(100) }),
  handler: {
    kind: "single",
    run: async (input): Promise<JobResult> => {
      const { sweepStuckLeads } = await import("./sweeper");
      return sweepStuckLeads(input.batchSize);
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 30_000 },
  idempotencyKey: () => `${SWEEPER_JOB_NAME}:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
});

export const workflowJobs: readonly AnyJobDefinition[] = [leadAdvanceJob, advanceSweeperJob];
