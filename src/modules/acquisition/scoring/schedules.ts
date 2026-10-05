/**
 * Scoring schedules (phase-11 Step 8). Registered on the acquisition manifest by Phase 19 through
 * `phases/11/REQUESTS.md`. All times are Africa/Lagos (the cron tick itself runs in UTC).
 */

import type { CronSchedule } from "@/contracts/jobs";

export const scoringSchedules: CronSchedule[] = [
  {
    id: "scoring-batch",
    job: "acquisition.scoring.batch",
    cron: "*/10 * * * *",
    timezone: "Africa/Lagos",
    description: "Pick up AUDITED leads and score them.",
  },
  {
    id: "scoring-rescore-nightly",
    job: "acquisition.scoring.rescore-nightly",
    cron: "0 1 * * *",
    timezone: "Africa/Lagos",
    description: "Re-score stale SCORED leads overnight at 01:00 (clear of the platform 02:00 cleanup).",
  },
  {
    id: "crosssell-detect",
    job: "acquisition.crosssell.detect",
    cron: "*/15 * * * *",
    timezone: "Africa/Lagos",
    description: "Sweep for companies qualifying across lines.",
  },
  {
    id: "capacity-release",
    job: "acquisition.capacity.release",
    cron: "5-55/10 * * * *",
    timezone: "Africa/Lagos",
    description: "Refresh line capacity modes and release held leads (staggered off scoring-batch).",
  },
];
