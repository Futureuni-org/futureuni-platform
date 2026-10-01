/**
 * Audit jobs (Phase 10). Registered on the acquisition manifest by Phase 19 through
 * `phases/10/REQUESTS.md` (same pattern as enrichment).
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

export const auditLeadJob: AnyJobDefinition = defineJob<{ leadId: string; force: boolean }>({
  name: "acquisition.audits.lead",
  description: "Audit one lead: run its service line's audit agent(s) and transition ENRICHED → AUDITING → AUDITED.",
  input: z.object({ leadId: z.string().min(1), force: z.boolean().default(false) }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { runAudits } = await import("./orchestration/run-audits");
      const result = await runAudits({
        leadId: input.leadId,
        actor: ctx.actor,
        jobRunId: ctx.jobRunId,
        force: input.force,
        now: () => ctx.clock.now(),
        signal: ctx.signal,
        log: ctx.log,
      });
      return {
        counts: { findings: result.findingCount, pitchable: result.pitchableCount, audits: result.auditIds.length },
        summary: `${result.status}:${result.finalLeadStatus}`,
      };
    },
  },
  concurrency: 4,
  timeoutMs: 180_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 120_000 },
  idempotencyKey: ({ leadId }) => `acquisition.audits.lead:${leadId}`,
  allowManualRun: true,
  systemActions: [],
});

export const auditBatchJob: AnyJobDefinition = defineJob<{ batchSize: number }>({
  name: "acquisition.audits.batch",
  description: "Pick up ENRICHED leads and enqueue individual audit runs.",
  input: z.object({ batchSize: z.int().min(1).max(200).default(25) }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { enqueueAuditBatch } = await import("./batch");
      return enqueueAuditBatch(input.batchSize);
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.audits.batch:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
});

export const auditRefreshJob: AnyJobDefinition = defineJob<{ olderThanDays: number }>({
  name: "acquisition.audits.refresh",
  description: "Re-audit active leads whose last audit is older than the setting, before a new sequence step.",
  input: z.object({ olderThanDays: z.int().min(1).max(365).default(30) }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { refreshStaleAudits } = await import("./batch");
      return refreshStaleAudits(input.olderThanDays);
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ olderThanDays }) => `acquisition.audits.refresh:${String(olderThanDays)}`,
  allowManualRun: true,
});

export const auditJobs: readonly AnyJobDefinition[] = [auditLeadJob, auditBatchJob, auditRefreshJob];
