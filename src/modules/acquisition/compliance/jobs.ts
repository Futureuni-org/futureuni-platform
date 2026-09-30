/**
 * Compliance jobs (Phase 9). Registered on the acquisition manifest by Phase 19 through
 * `phases/09/REQUESTS.md`.
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

export const retentionPurgeJob: AnyJobDefinition = defineJob<{ dryRun: boolean }>({
  name: "acquisition.compliance.retention-purge",
  description: "Anonymise personal data on DISQUALIFIED and LOST leads past the retention period.",
  input: z.object({ dryRun: z.boolean().default(false) }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { runAcquisitionRetentionPurge } = await import("./retention");
      const result = await runAcquisitionRetentionPurge(
        { type: "SYSTEM", job: "acquisition.compliance.retention-purge" },
        { dryRun: input.dryRun },
      );
      return { counts: { candidates: result.candidates, anonymised: result.anonymisedContacts, notesErased: result.notesErased } };
    },
  },
  concurrency: 1,
  timeoutMs: 600_000,
  retry: { maxAttempts: 2, backoff: "fixed", initialDelayMs: 10_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ dryRun }) => `acquisition.compliance.retention-purge:${dryRun ? "dry" : "run"}`,
  allowManualRun: true,
  systemActions: ["acquisition.retention.preview"],
});

export const reevaluateJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.compliance.reevaluate",
  description: "Re-evaluate open Nigerian leads after acquisition.compliance.ngDirectMarketingBasis changes.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async () => {
      const { reevaluateOpenLeads } = await import("./reevaluate");
      return reevaluateOpenLeads();
    },
  },
  concurrency: 1,
  timeoutMs: 600_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.compliance.reevaluate:${new Date().toISOString().slice(0, 13)}`,
  allowManualRun: true,
  systemActions: ["acquisition.lead.update"],
});

export const complianceJobs: readonly AnyJobDefinition[] = [retentionPurgeJob, reevaluateJob];
