/**
 * Inbox schedules (Phase 13). Poll every 5 minutes, SLA check every 15 minutes, nurture reminders
 * daily. All in Africa/Lagos; the cron tick itself runs in UTC. Registered on the acquisition
 * manifest by Phase 19 through `phases/13/REQUESTS.md`.
 */

import type { CronSchedule } from "@/contracts/jobs";

export const inboxSchedules: readonly CronSchedule[] = [
  { id: "inbox-poll", job: "acquisition.inbox.poll", cron: "*/5 * * * *", timezone: "Africa/Lagos", description: "Poll outreach mailboxes for replies." },
  { id: "inbox-sla-check", job: "acquisition.inbox.sla-check", cron: "*/15 * * * *", timezone: "Africa/Lagos", description: "Warn and escalate reply SLAs." },
  { id: "inbox-nurture-reminders", job: "acquisition.inbox.nurture-reminders", cron: "5 7 * * *", timezone: "Africa/Lagos", description: "Daily at 07:05: NOT_NOW follow-up reminders." },
];
