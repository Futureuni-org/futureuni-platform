/**
 * Outreach schedules (Phase 12), driven by the single Vercel Cron tick (ADR-003). Registered on the
 * acquisition manifest by Phase 19 through `phases/12/REQUESTS.md`.
 */

import type { CronSchedule } from "@/contracts/jobs";

export const outreachSchedules: readonly CronSchedule[] = [
  {
    id: "outreach-tick",
    job: "acquisition.outreach.tick",
    cron: "*/5 * * * *",
    timezone: "Africa/Lagos",
    description: "Advance outreach sequences and dispatch due sends every 5 minutes.",
  },
  {
    id: "outreach-mailbox-health",
    job: "acquisition.outreach.mailbox-health",
    cron: "0 7 * * *",
    timezone: "Africa/Lagos",
    description: "Daily mailbox hard-bounce health check and auto-pause.",
  },
  {
    id: "outreach-dns-check",
    job: "acquisition.outreach.dns-check",
    cron: "30 6 * * *",
    timezone: "Africa/Lagos",
    description: "Daily SPF/DKIM/DMARC/MX re-check for every sending domain.",
  },
];
