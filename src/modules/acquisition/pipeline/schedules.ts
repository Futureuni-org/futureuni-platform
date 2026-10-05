/**
 * Pipeline schedules (Phase 14). Registered on the acquisition manifest by Phase 19. Final times
 * are reconciled in `docs/schedules.md` (Phase 19); these are sensible defaults in Africa/Lagos.
 * The sweeps are idempotent, so a missed or duplicated cron tick is safe (INV-22).
 */

import type { CronSchedule } from "@/contracts/jobs";

export const pipelineSchedules: readonly CronSchedule[] = [
  {
    id: "pipeline-precall-brief",
    job: "acquisition.pipeline.precall-brief",
    cron: "5-50/15 * * * *",
    timezone: "Africa/Lagos",
    description: "Every 15 minutes (at :05/:20/:35/:50): generate pre-call briefs due within the lead-time window.",
  },
  {
    id: "pipeline-meeting-reminders",
    job: "acquisition.pipeline.meeting-reminders",
    cron: "10-55/15 * * * *",
    timezone: "Africa/Lagos",
    description: "Every 15 minutes (at :10/:25/:40/:55): send owner meeting reminders due at 24h and 1h.",
  },
  {
    id: "pipeline-stale-check",
    job: "acquisition.pipeline.stale-check",
    cron: "20 8 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 08:20: flag stale leads (clear of the platform 08:00 digest).",
  },
  {
    id: "pipeline-proposal-expiry",
    job: "acquisition.pipeline.proposal-expiry",
    cron: "10 7 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 07:10: expire proposals past their validity.",
  },
  {
    id: "pipeline-reengage",
    job: "acquisition.pipeline.reengage",
    cron: "20 6 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 06:20: release lost leads due for re-engagement (clear of platform 06:00).",
  },
];
