/**
 * Enrichment jobs (Phase 9). Registered on the acquisition manifest by Phase 19 through
 * `phases/09/REQUESTS.md`.
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

export const enrichLeadJob: AnyJobDefinition = defineJob<{ leadId: string }>({
  name: "acquisition.enrichment.lead",
  description: "Enrich one lead: crawl the website, extract contacts, run compliance, then transition to ENRICHED.",
  input: z.object({ leadId: z.string().min(1) }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { enrichLead } = await import("./pipeline");
      const result = await enrichLead({
        leadId: input.leadId,
        actor: { type: "SYSTEM", job: "acquisition.enrichment.lead" },
      });
      return {
        counts: {
          emails: result.emailsFound,
          phones: result.phonesFound,
          pages: result.pagesFetched,
        },
        summary: `${result.status}:${result.emailVerdict}`,
      };
    },
  },
  concurrency: 5,
  timeoutMs: 180_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ leadId }) => `acquisition.enrichment.lead:${leadId}`,
  allowManualRun: false,
  systemActions: ["acquisition.lead.update", "acquisition.lead.reaudit"],
});

export const enrichBatchJob: AnyJobDefinition = defineJob<{ batchSize: number }>({
  name: "acquisition.enrichment.batch",
  description: "Pick up NEW leads and enqueue individual enrichment runs.",
  input: z.object({ batchSize: z.int().min(1).max(200).default(25) }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { enqueueBatch } = await import("./batch");
      return enqueueBatch(input.batchSize);
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.enrichment.batch:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
});

export const enrichRefreshJob: AnyJobDefinition = defineJob<{ olderThanDays: number }>({
  name: "acquisition.enrichment.refresh",
  description: "Re-enrich active leads whose last enrichment is older than the setting.",
  input: z.object({ olderThanDays: z.int().min(1).max(365).default(60) }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { refreshStaleLeads } = await import("./batch");
      return refreshStaleLeads(input.olderThanDays);
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ olderThanDays }) => `acquisition.enrichment.refresh:${String(olderThanDays)}`,
  allowManualRun: true,
});

export const enrichmentJobs: readonly AnyJobDefinition[] = [enrichLeadJob, enrichBatchJob, enrichRefreshJob];
