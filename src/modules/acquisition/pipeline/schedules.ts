/**
 * Pipeline schedules (Phase 14). Registered on the acquisition manifest by Phase 19. Final times
 * are reconciled in `docs/schedules.md` (Phase 19); these are sensible defaults in Africa/Lagos.
 * The sweeps are idempotent, so a missed or duplicated cron tick is safe (INV-22).
 */

import type { CronSchedule } from "@/contracts/jobs";

export const pipelineSchedules: readonly CronSchedule[] = [
  {
    id: "acquisition.pipeline.precall-brief",
    job: "acquisition.pipeline.precall-brief",
    cron: "*/15 * * * *",
    timezone: "Africa/Lagos",
    description: "Every 15 minutes: generate pre-call briefs due within the lead-time window.",
  },
  {
    id: "acquisition.pipeline.meeting-reminders",
    job: "acquisition.pipeline.meeting-reminders",
    cron: "*/15 * * * *",
    timezone: "Africa/Lagos",
    description: "Every 15 minutes: send owner meeting reminders due at 24h and 1h.",
  },
  {
    id: "acquisition.pipeline.stale-check",
    job: "acquisition.pipeline.stale-check",
    cron: "0 8 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 08:00: flag stale leads.",
  },
  {
    id: "acquisition.pipeline.proposal-expiry",
    job: "acquisition.pipeline.proposal-expiry",
    cron: "0 7 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 07:00: expire proposals past their validity.",
  },
  {
    id: "acquisition.pipeline.reengage",
    job: "acquisition.pipeline.reengage",
    cron: "0 6 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 06:00: release lost leads due for re-engagement.",
  },
];
