# Scheduled jobs

Every scheduled job on the platform, its cadence, what it does, its typical duration, cost drivers and safety limits. One Vercel Cron entry (`GET /api/cron/tick`, every 5 minutes, ADR-003) drives all of these: the dispatcher (`src/platform/jobs/dispatcher.ts`) computes which schedules are due in the current 5-minute slot and enqueues each one with the idempotency key `<job>:<slot-iso>` (static) or `<job>:<scheduleId>:<slot-iso>` (dynamic), so a duplicated or missed tick is always safe (INV-22).

**Times are `Africa/Lagos` (WAT, UTC+1).** The cron tick runs in UTC; each schedule carries its own timezone and the dispatcher evaluates it per timezone. Because the tick granularity is 5 minutes, every schedule fires in the 5-minute slot that contains its cron time, so cron minutes are chosen on 5-minute boundaries and daily jobs are staggered into **distinct** 5-minute slots. Sources of truth: `src/modules/acquisition/<area>/schedules.ts`, `src/modules/acquisition/sourcing/schedules.ts` (dynamic), and `src/platform/jobs/platform-jobs.ts` (`platformSchedules`).

Any schedule can be paused with the setting `jobs.<job>.enabled = false` (the dispatcher skips disabled jobs); schedules for a disabled module disappear entirely (`getCronSchedules({ modules: await getEnabledModules() })`).

## Frequent (sub-hourly)

| Slot (WAT) | Schedule | Job | Does | Typical | Cost drivers | Safety limits |
|---|---|---|---|---|---|---|
| every 5 min | `outreach-tick` | `acquisition.outreach.tick` | Advance due sequence steps, draft next steps, dispatch due sends inside each recipient's send window | 1–20 s | AI drafts (per step), mailbox sends | conc 1; send window + mailbox daily cap + warm-up ramp (INV-8); `acquisition.outreach.globalPause` halts all sends |
| every 5 min | `inbox-poll` | `acquisition.inbox.poll` | Poll outreach mailboxes for new replies | 1–10 s | IMAP/Gmail reads | conc 1; mock in preview |
| `:00/:10/:20/:30/:40/:50` | `scoring-batch` | `acquisition.scoring.batch` | Sweep `AUDITED` leads and score them (safety net for the advance workflow) | 1–30 s | per-lead scoring; borderline AI review | conc 1; batch size |
| `:05/:15/:25/:35/:45/:55` | `capacity-release` | `acquisition.capacity.release` | Refresh each line's capacity mode and release held leads in score order | 1–10 s | — | conc 1; staggered off `scoring-batch` |
| `:00/:15/:30/:45` | `crosssell-detect` | `acquisition.crosssell.detect` | Detect companies qualifying across lines; keep one leading lead per group | 1–15 s | — | conc 2; INV-9 (one active thread/company) |
| `:00/:15/:30/:45` | `inbox-sla-check` | `acquisition.inbox.sla-check` | Warn and escalate reply SLAs | 1–5 s | — | conc 1 |
| `:05/:20/:35/:50` | `pipeline-precall-brief` | `acquisition.pipeline.precall-brief` | Generate pre-call briefs due within the lead-time window (meeting −2 h) | 2–30 s | AI brief per meeting | conc 1 |
| `:10/:25/:40/:55` | `pipeline-meeting-reminders` | `acquisition.pipeline.meeting-reminders` | Send owner meeting reminders due at 24 h and 1 h | 1–10 s | notifications | conc 1 |
| `:00/:30` | `advance-sweeper` | `acquisition.lead.advance-sweeper` | Re-advance leads stuck in any pre-contact status past the stuck threshold (score order), flagging the exhausted ones for attention | 1–60 s | re-run enrich/audit/score/draft per stuck lead | conc 1; `acquisition.advance.stuckThresholdMinutes`, `acquisition.advance.maxRestarts`; skips cross-sell-held and already-flagged leads |

## Daily (overnight → pre-workday, staggered)

| Time (WAT) | Schedule | Job | Does | Typical | Cost drivers | Safety limits |
|---|---|---|---|---|---|---|
| 01:00 | `scoring-rescore-nightly` | `acquisition.scoring.rescore-nightly` | Re-score stale `SCORED` leads | 5–60 s | per-lead scoring | conc 1; never moves a `CONTACTED`+ lead backwards |
| 02:00 | `job-runs-cleanup` (platform) | `platform.job-runs-cleanup` | Trim old `JobRun` rows | 1–10 s | — | conc 1 |
| 03:00 | `retention-purge` (platform) | `platform.retention-purge` | Purge expired platform data (files, optionally audit log) | 5–60 s | storage deletes | conc 1; dry-run preview available |
| 03:30 | `compliance-retention-purge` | `acquisition.compliance.retention-purge` | Anonymise personal data on `DISQUALIFIED`/`LOST` leads past retention (INV-10, ADR-015) | 5–120 s | DB writes | conc 1; timeout 600 s; staggered 30 min after the platform purge; `acquisition.retention.preview` dry run |
| 06:00 | `credentials-health` (platform) | `platform.credentials-health` | Check integration credential health | 1–10 s | provider pings | conc 1 |
| 06:20 | `pipeline-reengage` | `acquisition.pipeline.reengage` | Release `LOST` leads due for re-engagement → `NURTURE` | 1–10 s | notifications | conc 1; skipped if another open lead exists for the company×line |
| 06:30 | `outreach-dns-check` | `acquisition.outreach.dns-check` | Re-check SPF/DKIM/DMARC/MX for every sending domain | 1–20 s | DNS lookups | conc 1 |
| 07:00 | `outreach-mailbox-health` | `acquisition.outreach.mailbox-health` | Hard-bounce health check; auto-pause unhealthy mailboxes | 1–10 s | — | conc 1; `bounceRatePauseThreshold` |
| 07:05 | `inbox-nurture-reminders` | `acquisition.inbox.nurture-reminders` | `NOT_NOW` follow-up reminders due today | 1–10 s | notifications | conc 1 |
| 07:10 | `pipeline-proposal-expiry` | `acquisition.pipeline.proposal-expiry` | Expire proposals past their validity | 1–10 s | — | conc 1 |
| 07:15 | `compliance-reevaluate` | `acquisition.compliance.reevaluate` | Re-evaluate open Nigerian leads against the current legal basis (INV-25) | 2–60 s | DB writes | conc 1; timeout 600 s; also runs on `settings.changed` |
| 08:00 | `notifications-digest` (platform) | `platform.notifications-digest` | Send the daily notification digest email | 1–20 s | email sends | conc 1 |
| 08:20 | `pipeline-stale-check` | `acquisition.pipeline.stale-check` | Flag stale leads per stage | 1–10 s | notifications | conc 1; `staleDaysByStage` |

## Weekly

| Time (WAT) | Schedule | Job | Does | Typical | Cost drivers | Safety limits |
|---|---|---|---|---|---|---|
| Mon 08:30 | `analytics-weekly-report` | `acquisition.analytics.weekly-report` | Email managers/admins the weekly insight + headline metrics | 5–60 s | one AI insight call | conc 1; idempotent per ISO week; `analytics.weeklyReportEnabled` |

## Dynamic (per saved search)

The sourcing dynamic-schedule provider (`getSourcingDynamicSchedules`, `src/modules/acquisition/sourcing/schedules.ts`) emits one schedule per **enabled saved search** at the search's own cron/timezone, each firing `acquisition.sourcing.run` with `{ savedSearchId }`. A run is **skipped** (never enqueued) when the search's line is at capacity (`skipScheduledRunIfAtCapacity`, module spec §3.10). Cost drivers: provider API calls per run; safety limits: `sourcing.maxProviderCallsPerRun`, `sourcing.maxCostMicrosPerRun`, `sourcing.providerDailyCostCapMicros`, conc 2, timeout 300 s.

## Notes on the advance pipeline vs. the sweepers

The normal path for a new lead is the durable **`acquisition.lead.advance`** workflow (`src/modules/acquisition/workflows/`), started on the `lead.created` event, which runs enrich → audit → score+brief → first-touch draft as resumable, idempotent steps under per-line and global concurrency caps.

The single **`advance-sweeper`** (every 30 min) is the safety net: it re-queues leads that have sat in a pre-contact status past `acquisition.advance.stuckThresholdMinutes`, newest-highest-score first, and after `acquisition.advance.maxRestarts` flags a lead for manual attention (`needsAttentionAt` + a `lead.needsAttention` event → `lead.needs-attention` notification). `scoring-batch` (every 10 min) still scores any `AUDITED` leads it finds, as a lighter net for the score step. Because every step and job is idempotent and status-guarded, a sweep never duplicates work the workflow already did.

The Wave 2–3 per-area batch/refresh jobs (`acquisition.enrichment.batch`/`.refresh`, `acquisition.audits.batch`/`.refresh`) remain **registered but unscheduled** — the advance workflow and the sweeper supersede their cron role; they stay available for manual bulk runs via `platform.job.runNow`.
