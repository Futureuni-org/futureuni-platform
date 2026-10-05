/**
 * Workflow schedules (Phase 19). One sweeper drives the safety net under the event-driven advance
 * workflow; the per-area batch jobs (enrichment/audits) stay for manual bulk runs. Time is
 * Africa/Lagos; see `docs/schedules.md`.
 */

import type { CronSchedule } from "@/contracts/jobs";

export const workflowSchedules: readonly CronSchedule[] = [
  {
    id: "advance-sweeper",
    job: "acquisition.lead.advance-sweeper",
    cron: "*/30 * * * *",
    timezone: "Africa/Lagos",
    description:
      "Every 30 minutes: re-advance leads stuck in a pre-contact status, flagging the exhausted ones for attention.",
  },
];
