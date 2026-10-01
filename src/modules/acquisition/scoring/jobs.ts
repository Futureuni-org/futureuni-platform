/**
 * Scoring jobs (phase-11 Step 8). Registered on the acquisition manifest by Phase 19 through
 * `phases/11/REQUESTS.md`. Handlers lazy-import their orchestration and `enqueueJob` to avoid the
 * manifest import cycle (same pattern as audits).
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

const minuteBucket = (): string => new Date().toISOString().slice(0, 16);

export const scoringLeadJob: AnyJobDefinition = defineJob<{ leadId: string }>({
  name: "acquisition.scoring.lead",
  description: "Score (or re-score) one lead and apply its outcome: qualify, disqualify, hold or review.",
  input: z.object({ leadId: z.string().min(1) }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { qualifyLead } = await import("./qualify");
      const result = await qualifyLead(input.leadId, {
        actor: ctx.actor,
        jobRunId: ctx.jobRunId,
        clock: ctx.clock,
      });
      return { summary: `${result.band}:${result.status}` };
    },
  },
  concurrency: 4,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 3_000, maxDelayMs: 60_000 },
  // Coalesce bursts (several signals in a minute) into one re-score; later minutes re-run.
  idempotencyKey: ({ leadId }) => `acquisition.scoring.lead:${leadId}:${minuteBucket()}`,
  allowManualRun: true,
});

export const scoringBatchJob: AnyJobDefinition = defineJob<{ batchSize: number }>({
  name: "acquisition.scoring.batch",
  description: "Pick up AUDITED leads and enqueue individual scoring runs.",
  input: z.object({ batchSize: z.int().min(1).max(500).default(50) }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { findAuditedLeads } = await import("./scoring.repo");
      const { enqueueJob } = await import("@/platform/jobs");
      const leads = await findAuditedLeads(input.batchSize);
      for (const lead of leads) {
        await enqueueJob("acquisition.scoring.lead", { leadId: lead.id }, { actor: ctx.actor });
      }
      return { counts: { enqueued: leads.length }, summary: `enqueued ${String(leads.length)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.scoring.batch:${minuteBucket()}`,
  allowManualRun: true,
});

export const scoringRescoreNightlyJob: AnyJobDefinition = defineJob<{ limit: number }>({
  name: "acquisition.scoring.rescore-nightly",
  description: "Re-score SCORED leads older than the configured age so stale scores don't linger.",
  input: z.object({ limit: z.int().min(1).max(2_000).default(500) }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { findStaleScoredLeads } = await import("./scoring.repo");
      const { getRescoreAgeDays } = await import("./config");
      const { enqueueJob } = await import("@/platform/jobs");
      const ageDays = await getRescoreAgeDays();
      const before = new Date(ctx.clock.now().getTime() - ageDays * 24 * 60 * 60 * 1000);
      const leads = await findStaleScoredLeads(before, input.limit);
      for (const lead of leads) {
        await enqueueJob("acquisition.scoring.lead", { leadId: lead.id }, { actor: ctx.actor });
      }
      return { counts: { enqueued: leads.length }, summary: `re-score ${String(leads.length)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 120_000 },
  idempotencyKey: () => `acquisition.scoring.rescore-nightly:${new Date().toISOString().slice(0, 10)}`,
  allowManualRun: true,
});

export const crossSellDetectJob: AnyJobDefinition = defineJob<{
  companyId?: string | undefined;
  leadId?: string | undefined;
}>({
  name: "acquisition.crosssell.detect",
  description: "Detect cross-sell groups for a company or lead, or sweep all candidate companies.",
  input: z.object({ companyId: z.string().optional(), leadId: z.string().optional() }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { detectCrossSell } = await import("@/modules/acquisition/crosssell");
      const { getLeadCompanyId, findCrossSellCandidateCompanies } = await import(
        "@/modules/acquisition/crosssell/crosssell.repo"
      );
      const detectCtx = { actor: ctx.actor, clock: ctx.clock };

      let companyIds: string[];
      if (input.companyId !== undefined) {
        companyIds = [input.companyId];
      } else if (input.leadId !== undefined) {
        const companyId = await getLeadCompanyId(input.leadId);
        companyIds = companyId === null ? [] : [companyId];
      } else {
        companyIds = await findCrossSellCandidateCompanies(200);
      }

      let created = 0;
      for (const companyId of companyIds) {
        const result = await detectCrossSell(companyId, detectCtx);
        if (result.created) created += 1;
      }
      return { counts: { companies: companyIds.length, groupsCreated: created } };
    },
  },
  concurrency: 2,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 3_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ companyId, leadId }) =>
    `acquisition.crosssell.detect:${companyId ?? leadId ?? "sweep"}:${minuteBucket()}`,
  allowManualRun: true,
});

export const capacityReleaseJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.capacity.release",
  description: "Refresh each line's capacity mode and release capacity-held leads when a line reopens.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { refreshAllLines } = await import("./throttle");
      const results = await refreshAllLines({ now: ctx.clock.now(), actor: ctx.actor });
      const released = results.reduce((sum, r) => sum + r.released, 0);
      const changed = results.filter((r) => r.from !== r.to).length;
      return { counts: { linesChanged: changed, released } };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.capacity.release:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
});

export const scoringJobs: readonly AnyJobDefinition[] = [
  scoringLeadJob,
  scoringBatchJob,
  scoringRescoreNightlyJob,
  crossSellDetectJob,
  capacityReleaseJob,
];
