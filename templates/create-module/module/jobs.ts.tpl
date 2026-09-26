/**
 * __MODULE_NAME__'s background jobs (docs/contracts/jobs.md). Each job is declared with defineJob,
 * which parses the input with the job's own schema before the handler runs. Add a job's schedule
 * to the manifest's `schedules` if it should run on a timetable.
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

import { describeRecentNotes } from "./core/example";

export const __MODULE_ID__Jobs: AnyJobDefinition[] = [
  defineJob<{ limit: number }>({
    name: "__MODULE_ID__.example-digest",
    description: "Counts the module's recent notes (an example job to copy).",
    input: z.object({ limit: z.int().min(1).max(100) }),
    handler: {
      kind: "single",
      run: async ({ limit }, ctx) => {
        const summary = await describeRecentNotes(limit);
        ctx.log.info("example digest", { summary });
        return { summary };
      },
    },
    concurrency: 1,
    timeoutMs: 60_000,
    retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
    idempotencyKey: ({ limit }) => `__MODULE_ID__.example-digest:${String(limit)}`,
    allowManualRun: true,
  }),
];
