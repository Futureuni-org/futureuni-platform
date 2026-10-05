/**
 * Analytics schedules (Phase 17). Registered on the acquisition manifest by Phase 19; final times
 * are reconciled in `docs/schedules.md`. The weekly report runs Monday 08:00 Africa/Lagos and is
 * idempotent per ISO week (INV-22), so a duplicated cron tick never emails twice.
 */

import type { CronSchedule } from "@/contracts/jobs";

export const analyticsSchedules: readonly CronSchedule[] = [
  {
    id: "analytics-weekly-report",
    job: "acquisition.analytics.weekly-report",
    cron: "30 8 * * 1",
    timezone: "Africa/Lagos",
    description: "Monday at 08:30: email managers and admins the weekly insight and headline metrics.",
  },
];
