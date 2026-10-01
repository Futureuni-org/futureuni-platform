/**
 * Sourcing jobs (Phase 8). `acquisition.sourcing.run` runs one search (manual or scheduled). Its
 * idempotency key is the saved search + slot for scheduled runs (so a duplicated cron tick never
 * runs twice), or a caller-supplied nonce for manual runs. A scheduled run for a line at capacity
 * doesn't source: it records a SKIPPED SearchRun and notifies the owners at most once a day
 * (module spec §3.5, §3.10, AC-4.3). Registered on the manifest by Phase 19 (phases/08/REQUESTS.md).
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { SearchSpecSchema } from "@/contracts/source-adapter";
import { defineJob } from "@/platform/registry/define";

const SourcingRunInputSchema = z.object({
  spec: SearchSpecSchema,
  savedSearchId: z.string().optional(),
  /** The scheduled slot (ISO), part of the idempotency key for scheduled runs. */
  slot: z.string().optional(),
  notifyUserId: z.string().optional(),
  /** A caller nonce for manual runs, to keep the idempotency key deterministic. */
  nonce: z.string().optional(),
});
type SourcingRunInput = z.infer<typeof SourcingRunInputSchema>;

export const sourcingRunJob: AnyJobDefinition = defineJob<SourcingRunInput>({
  name: "acquisition.sourcing.run",
  description: "Run a service line's source adapters for a search spec (manual or scheduled).",
  input: SourcingRunInputSchema,
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      if (input.savedSearchId !== undefined) {
        const { skipScheduledRunIfAtCapacity } = await import("./schedules");
        const skipped = await skipScheduledRunIfAtCapacity(
          { savedSearchId: input.savedSearchId, spec: input.spec, actor: ctx.actor, clock: ctx.clock },
        );
        if (skipped) return { summary: "SKIPPED:capacity" };
      }
      const { runSearch } = await import("./runner");
      const run = await runSearch(input.spec, {
        actor: ctx.actor,
        jobRunId: ctx.jobRunId,
        clock: ctx.clock,
        signal: ctx.signal,
        trigger: input.savedSearchId === undefined ? "MANUAL" : "SCHEDULED",
        savedSearchId: input.savedSearchId ?? null,
        ...(input.notifyUserId === undefined ? {} : { notifyUserId: input.notifyUserId }),
        log: ctx.log,
      });
      return { summary: run.status };
    },
  },
  concurrency: 2,
  timeoutMs: 300_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: (input) =>
    input.savedSearchId === undefined
      ? `acquisition.sourcing.run:${input.nonce ?? "adhoc"}`
      : `acquisition.sourcing.run:${input.savedSearchId}:${input.slot ?? "now"}`,
  allowManualRun: true,
  systemActions: ["acquisition.search.run"],
});

export const sourcingJobs: readonly AnyJobDefinition[] = [sourcingRunJob];
