# Batch B4 integration: Summary

| | |
|---|---|
| Batch / wave | B4 / Wave 3 (phases 11, 12, 14) |
| Date | 2026-10-01 |
| Recipe | `docs/prompts/wave-3/wave-3-prep-and-merge.md` Part C3, steps 1–4 (plus a non-reply flow test). Phase 13 (inbox) is batch B5, so the reply-driven branches are deferred. |
| Merge order | 11 (`dd414d3`) → 12 (`6f9ed2c`) → 14 (`cdffb84`), each a `--no-ff` merge into `main`. |
| Verification | `pnpm lint`: Pass · `pnpm typecheck`: Pass · acquisition tests: Pass (incl. `tests/integration/wave-3-flow.test.ts`) · `pnpm build`: Pass · `saas-review`: no open Critical/Major |

## What was integrated

Scoring (11), outreach (12) and pipeline (14) are merged and wired together on `main`. The cross-phase
seams now call the real providers, the three areas' jobs/schedules/settings/AI tasks/notifications/
subscribers are registered on the acquisition manifest, and a single non-reply journey runs end to end
through all three phases against the real seams.

## Seams connected (C3 step 2)

All stand-ins were replaced with the real providers; `grep -r "SEAM:" src` is clean. The two `_seams.ts`
files were converted into thin **lazy-delegation adapters** (not deleted) so the outreach ↔ pipeline
edge never forms a load-time import cycle; they contain no stand-in logic or seam markers.

| Seam | Consumer | Provider (real) |
|---|---|---|
| SEAM-LEAD-BRIEF | 12, 14 | `getLeadBrief` — `@/modules/acquisition/scoring` |
| SEAM-THROTTLE | 12 | `getOutreachThrottle` — `@/modules/acquisition/scoring` |
| SEAM-CROSSSELL | 12 | `getCrossSellContext` — `@/modules/acquisition/crosssell` |
| SEAM-BOOKING-LINK | 12 | `getBookingLink` — `@/modules/acquisition/pipeline` (lazy) |
| SEAM-STOP-SEQUENCE | 14 | `stopEnrollments` — `@/modules/acquisition/outreach` (lazy) |
| SEAM-SEND-ONEOFF | 14 | `sendOneOffEmail` — `@/modules/acquisition/outreach` (lazy) |

Seams Phase 12 provides for Phase 13 (`pauseEnrollment`, `proposeEnrollment`, `recordBounce`,
`listActiveMailboxes`) are real and unused until batch B5.

## Manifest registration (C3 step 3)

`src/modules/acquisition/manifest.ts` now spreads, imported from each area's leaf files:

- **jobs**: `scoringJobs`, `outreachJobs`, `pipelineJobs` (12 new jobs).
- **schedules**: `scoringSchedules`, `outreachSchedules`, `pipelineSchedules`.
- **settings**: `scoringSettings`, `outreachSettings`, `pipelineSettings`.
- **aiTasks**: `scoringTasks`, `outreachAiTasks`, `pipelineTasks` (7 new AI tasks).
- **notificationTypes**: `scoringNotificationTypes`, `outreachNotifications`, `pipelineNotificationTypes`.
- **subscribers**: `scoringSubscribers`, `outreachSubscribers`.

`pnpm registry:gen` regenerates `src/platform/registry/generated.ts` cleanly. All permissions were
already present in the manifest/matrix, so none were added. No duplicate setting keys
(`acquisition.defaultBookingUrl`/`acquisition.bookingUrl` are defined once, by pipeline).

## Requests applied (C3 step 4) and fixes

- **CR-11-*, CR-12-01/02, CR-14-01/02/03**: manifest registration and seam wiring (above).
- **CR-14-04**: `@react-pdf/renderer@^4.9.0` reconciled into `package.json`/`pnpm-lock.yaml` (`pnpm install`).
- **No schema migration** was needed (CR-11 confirms none; CR-12/14 confirm Phase 2 covers every model).
- **Integration fix — pipeline schedule ids.** Phase 14's `CronSchedule.id`s were dotted job-names
  (`acquisition.pipeline.precall-brief`), which fail the manifest's `id` pattern `/^[a-z0-9-]+$/`. They
  weren't validated in the worktree (the manifest isn't wired there). Renamed to kebab
  (`pipeline-precall-brief`, …) in `src/modules/acquisition/pipeline/schedules.ts`.
- **Integration fix — proposal-flow test.** `sendProposal` now calls the **real** `sendOneOffEmail`,
  which routes through the single send path (suppression, contactability, postal address, send window,
  mailbox). The Phase 14 `proposal-flow.integration.test.ts` previously asserted the stub's
  `SENT_MOCK`; it now asserts the pipeline outcome (`PROPOSAL_SENT`, PDF created, a `ONE_OFF` email with
  the PDF attached). The email's delivery status is Phase 12's concern and is covered by its send tests.

## Flow test (C3 step 5, non-reply path)

`tests/integration/wave-3-flow.test.ts` runs one journey for Web Development / International against the
real seams: `AUDITED → qualify → SCORED + brief` (11) → `createDraft → IN_REVIEW` → `approveMessage →
APPROVED` (real throttle) → `sendEmailMessage → CONTACTED` (12) → `createMeeting → MEETING_BOOKED` with
the sequence stopped via the real `stopEnrollments` (14) → `createProposal → approveProposal →
sendProposal → PROPOSAL_SENT` via the real `sendOneOffEmail` (14) → `markWon → WON + handoff` (14). The
reply branches (`INTERESTED`, `NOT_NOW`, `UNSUBSCRIBE`, `OUT_OF_OFFICE`, bounce) wait for Phase 13 (B5).

## Observations / follow-ups (not blocking)

- **One-off sends to engaged leads are gated by cold-email contactability.** The real `sendOneOffEmail`
  (used for proposals and inbox replies) runs the full INV-25 contactability check, so a proposal email
  to an engaged Nigerian lead (verdict `REVIEW` while `ngDirectMarketingBasis` is pending) is `BLOCKED`.
  Operationally a proposal to a lead that already replied is not cold outreach; whether one-off sends to
  engaged contacts should bypass the cold-email gate is a design question for Phase 20 / a future ADR.
- **CR-14-07** (notify line owners, not just managers, on `deal.won/lost`) is a Phase 6 router
  enhancement, left for later.
- `docs/schedules.md` reconciliation of the new cron entries is Phase 19's (M19-AC4).

## Remove the worktrees

After this batch is verified: `pnpm phase remove 11`, `pnpm phase remove 12`, `pnpm phase remove 14`.
