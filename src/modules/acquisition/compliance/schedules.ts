/**
 * Compliance schedules (Phase 9 area; registered on the acquisition manifest by Phase 19).
 *
 * - `compliance-reevaluate` re-evaluates open Nigerian leads daily, in case the legal-basis setting
 *   or a country rule changed (INV-25); the subscriber on `settings.changed` handles the immediate
 *   case, this is the periodic safety net.
 * - `compliance-retention-purge` anonymises personal data on DISQUALIFIED/LOST leads past the
 *   retention period (INV-10, ADR-015). It is the acquisition half of the platform retention sweep
 *   and is staggered 30 minutes after `platform.retention-purge` (03:00) so the two never contend.
 *
 * Both are idempotent (INV-22). Times are Africa/Lagos; see `docs/schedules.md`.
 */

import type { CronSchedule } from "@/contracts/jobs";

export const complianceSchedules: readonly CronSchedule[] = [
  {
    id: "compliance-retention-purge",
    job: "acquisition.compliance.retention-purge",
    cron: "30 3 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 03:30: anonymise personal data on DISQUALIFIED/LOST leads past retention.",
  },
  {
    id: "compliance-reevaluate",
    job: "acquisition.compliance.reevaluate",
    cron: "15 7 * * *",
    timezone: "Africa/Lagos",
    description: "Daily at 07:15: re-evaluate open Nigerian leads against the current legal basis.",
  },
];
