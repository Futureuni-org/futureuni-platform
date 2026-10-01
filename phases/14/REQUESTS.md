# Phase 14 — change requests

Applied at Wave 3 integration (`docs/prompts/wave-3-prep-and-merge.md` Part C3). Nothing here was changed on a path Phase 14 doesn't own.

## CR-14-01 — Register the pipeline manifest inputs (Phase 19)

Add the Phase 14 registration arrays to the acquisition manifest (`src/modules/acquisition/manifest.ts`). **Import from the leaf files, never the `@/modules/acquisition/pipeline` barrel** (the barrel pulls in the AI registry — the TDZ cycle that bit Phases 8/10):

- `jobs`: `pipelineJobs` from `@/modules/acquisition/pipeline/jobs` — `acquisition.pipeline.{precall-brief,meeting-reminders,stale-check,proposal-expiry,reengage}`.
- `schedules`: `pipelineSchedules` from `@/modules/acquisition/pipeline/schedules` (static `CronSchedule[]`; reconcile the final times into `docs/schedules.md`).
- `settings`: `pipelineSettings` from `@/modules/acquisition/pipeline/settings`.
- `aiTasks`: `pipelineTasks` from `@/modules/acquisition/pipeline/tasks`.
- `notificationTypes`: `pipelineNotificationTypes` from `@/modules/acquisition/pipeline/notifications`.

Then run `pnpm registry:gen` and `pnpm check`.

## CR-14-02 — Seams Phase 14 consumes (stubbed; wire the real implementations and delete the stand-ins)

Phase 14 ran in parallel with 11 and 12, so these are stand-ins in `src/modules/acquisition/pipeline/_seams.ts` with `// SEAM:<ID>` markers. At integration, replace each call with the real implementation and **delete `_seams.ts`**, then confirm `grep -r "SEAM:" src/modules/acquisition/pipeline` is empty.

| Seam | Provider | Stand-in (current) | Wire to |
|---|---|---|---|
| `SEAM-LEAD-BRIEF` (`getLeadBrief`) | 11 | reads `Lead.brief`/`scoreReasons`/`keyFindingIds` | Phase 11's `getLeadBrief`. Only `proposals/proposals.ts` and `meetings/meetings.ts` read findings; the brief fields they use already exist on `Lead`, so this seam is low-risk. |
| `SEAM-STOP-SEQUENCE` (`stopEnrollments`) | 12 | `stopEnrollmentsDirect` sets `ACTIVE`/`PAUSED` enrolments to `STOPPED` | Phase 12's `stopEnrollments`. Called from `meetings` (MEETING_BOOKED), `deals` (WON/LOST) and `board.nurtureLead` (MANUAL). |
| `SEAM-SEND-ONEOFF` (`sendOneOffEmail`) | 12 | `createMockOneOff` writes a `SENT_MOCK` `Message` | Phase 12's `sendOneOffEmail`. Called from `proposals.sendProposal` with the PDF attached and `humanConfirmedClaims: true`. |

The import sites to update after deleting `_seams.ts`: `meetings/meetings.ts`, `deals/deals.ts`, `board/board.ts`, `proposals/proposals.ts` (all import from `../_seams`).

## CR-14-03 — Seam Phase 14 provides

`SEAM-BOOKING-LINK` → `getBookingLink(leadId, ownerId?): Promise<string>` is implemented for real in `src/modules/acquisition/pipeline/meetings/meetings.ts` and re-exported from the module barrel. Consumers 12 and 13 should call it and delete their `acquisition.defaultBookingUrl + "?lead=<id>"` stand-in. It reads the owner's `acquisition.bookingUrl` (falling back to `acquisition.defaultBookingUrl`) and embeds a signed `leadRef`.

## CR-14-04 — Dependency added

`@react-pdf/renderer@^4.9.0` (added with `pnpm add`; see SUMMARY §Dependencies). It is a default Next.js server external (ADR-022). Reconcile `package.json`/`pnpm-lock.yaml` at merge by reinstalling. **Deploy note (Phase 21):** the bundled brand TTFs under `src/modules/acquisition/pipeline/proposals/pdf/fonts/*.ttf` must be included in the serverless bundle (e.g. `outputFileTracingIncludes`) so `Font.register`'s file paths resolve at runtime on Vercel.

## CR-14-05 — No schema or contract changes needed (confirmation)

Phase 2's schema already covers everything: `Meeting` (incl. `precallBrief`, `summary`, `transcript`, `outcomeNotes`, reminder timestamps), `Proposal` + `ProposalLineItem` (versioning via `proposalGroupId` + `version`, status `SUPERSEDED`), `Deal` (`valueMinor`, `lostReason`, `reengageAt`), `Handoff` + `HandoffAssignment`, the `WebhookEvent` dedupe index, and `FilePurpose.PROPOSAL_PDF`/`HANDOFF_PDF`. There is no `MeetingOutcome` enum — outcome is `MeetingStatus` (`HELD`/`NO_SHOW`/`CANCELLED`/`SCHEDULED`) plus `outcomeNotes`; a rescheduled outcome returns the meeting to `SCHEDULED` and writes a `FLAG` `LeadEvent` (§5.2). No request needed.

## CR-14-06 — Permissions (confirmation, no change)

All actions Phase 14 checks already exist in the permission matrix (`.claude/project-rules.md`) and the acquisition manifest: `acquisition.pipeline.read/move`, `acquisition.meeting.manage`, `acquisition.proposal.create/approve/approveException/send`, `acquisition.deal.close`, `acquisition.handoff.assign/acknowledge`, `acquisition.lead.read/update`, `acquisition.analytics.read`. No new permissions are registered.

## CR-14-07 — Notification-router refinement (Phase 6 file, optional enhancement)

`deal.won`/`deal.lost` are routed by Phase 6's `notification-router` (`src/platform/notifications/router.ts`) to the owner and `MANAGER`s only. The module spec's recipients also include the line owners (`SERVICE_LEAD` of the line). Consider extending `routeDealClosed` to add `serviceLine` + `role: "SERVICE_LEAD"`. Phase 14 does not duplicate this itself to avoid double-notifying.

## CR-14-08 — Settings keys defined by Phase 14

MODULE scope unless noted. Defaults in `settings.ts`:
`acquisition.pipeline.discountApprovalThresholdBps` (1000), `…staleDaysByStage` (JSON per stage), `…reminderOffsetsMinutes` ([1440, 60]), `…precallLeadMinutes` (120), `…taxEnabled` (false), `…taxRateBps` (750), `…proposalValidityDays` (30), `acquisition.defaultBookingUrl` (MODULE), `acquisition.bookingUrl` (USER). If Phase 12/13 also define `acquisition.defaultBookingUrl`/`acquisition.bookingUrl`, keep one definition at integration (they are identical shared keys).

## CR-14-09 — Cal.com webhook secret (launch gate)

`src/env.ts` already declares `CALCOM_WEBHOOK_SECRET` (optional). `getCalWebhookSecret()` prefers `env` and falls back to `process.env` so a phase's own integration test can set it; in production the webhook returns 401 until the secret is configured. Ensure it is set before Cal.com is switched on (Phase 21 launch checklist).
