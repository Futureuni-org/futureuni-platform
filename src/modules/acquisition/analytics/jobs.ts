/**
 * Analytics jobs (Phase 17). Registered on the acquisition manifest by Phase 19 through
 * `phases/17/REQUESTS.md`. The heavy report logic is imported lazily so loading this leaf file
 * (as the manifest does) never boots the AI registry. The SYSTEM actor reads analytics, so its
 * `systemActions` lists the permission its services perform (permissions.md rule 10).
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

const EmptyInput = z.object({}).default({});

function isoWeekSlot(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${String(d.getUTCFullYear())}-W${String(week).padStart(2, "0")}`;
}

export const weeklyReportJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.analytics.weekly-report",
  description: "Email managers and admins the weekly acquisition insight and headline metrics.",
  input: EmptyInput,
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { runWeeklyReport } = await import("./insight/report");
      const result = await runWeeklyReport(ctx.clock.now(), ctx.jobRunId);
      return {
        counts: { emailed: result.emailed },
        summary: result.skipped ? "skipped (disabled)" : `emailed ${String(result.emailed)}`,
      };
    },
  },
  concurrency: 1,
  timeoutMs: 300_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.analytics.weekly-report:${isoWeekSlot(new Date())}`,
  systemActions: ["acquisition.analytics.read", "acquisition.overview.read"],
  allowManualRun: true,
});

export const analyticsJobs: readonly AnyJobDefinition[] = [weeklyReportJob];
