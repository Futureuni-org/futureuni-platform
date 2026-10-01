# Phase 12 — change requests

Applied at Wave 3 / batch B4 integration (`docs/prompts/wave-3/wave-3-prep-and-merge.md`, Part C3).

## CR-12-01 — Manifest wiring (type: service gap; owner: Phase 19, `M/manifest.ts`)

Phase 12 cannot edit `src/modules/acquisition/manifest.ts` (owned by 19). Import the outreach
registration arrays from their leaf files (not the `index.ts` barrel — the barrel pulls runtime code
that imports `@/platform/ai`, which would form a manifest ↔ registry cycle) and spread them into the
manifest, exactly as sourcing/audits are wired:

```ts
import { outreachJobs } from "./outreach/jobs";
import { outreachSchedules } from "./outreach/schedules";
import { outreachSettings } from "./outreach/settings";
import { outreachNotifications } from "./outreach/notifications";
import { outreachSubscribers } from "./outreach/subscribers";
import { outreachAiTasks } from "./outreach/draft/tasks";
// …
jobs: [...enrichmentJobs, ...complianceJobs, ...sourcingJobs, ...auditJobs, ...outreachJobs],
schedules: [...outreachSchedules],
settings: [..., ...outreachSettings],
subscribers: [...complianceSubscribers, ...outreachSubscribers],
aiTasks: [...profilesAiTasks, ..., ...auditTasks, ...outreachAiTasks],
notificationTypes: [...sourcingNotificationTypes, ...outreachNotifications],
```

All `acquisition.*` outreach permissions are already in the manifest (Phase 0/2), so no permission
change is needed. Phase 19's manifest↔matrix test should stay green.

## CR-12-02 — Connect the consumed seams (type: seam wiring; done at integration)

Phase 12 stubbed these in `src/modules/acquisition/outreach/_seams.ts` (each marked `// SEAM:<ID>`).
At integration, delete the stub and import the real provider; then `grep -r "SEAM:" src` must be
clean for these IDs.

| Seam | Provider | Replace the stub with |
|---|---|---|
| `SEAM-LEAD-BRIEF` | Phase 11 | `getLeadBrief` from `@/modules/acquisition/scoring` |
| `SEAM-THROTTLE` | Phase 11 | `getOutreachThrottle` from `@/modules/acquisition/scoring` (or crosssell) |
| `SEAM-CROSSSELL` | Phase 11 | `getCrossSellContext` from `@/modules/acquisition/crosssell` |
| `SEAM-BOOKING-LINK` | Phase 14 | `getBookingLink` from `@/modules/acquisition/pipeline` |

`_seams.ts` is the only importer of these stubs (`draft/draft.ts`, `review/review.ts`). Update those
imports to the real modules and delete `_seams.ts`.

**Provided seams** (no wiring needed; Phases 13/14 import them from `@/modules/acquisition/outreach`):
`stopEnrollments`, `pauseEnrollment`, `proposeEnrollment`, `sendOneOffEmail`, `recordBounce`,
`listActiveMailboxes`. Their signatures match the Part B2 table.

## CR-12-03 — Contract `tx` type note (type: contract; owner: Phase 2, non-blocking)

`src/contracts/outreach-channel.ts` types `StopEnrollments`/`PauseEnrollment`/`RecordBounce` `tx` as
`unknown`, while the wave-3 guide and `docs/contracts/outreach-channel.md` write `Tx | null`. Phase 12
implements to the `.ts` contract (`unknown`) and narrows internally with `dbOr`/a cast. No change is
required to compile; flagging only so the contract `.ts` and `.md` can be reconciled to `Tx | null`
in a later tidy-up.

## CR-12-04 — Bounce / unsubscribe suppression cascade (type: note; no change required)

`recordBounce` and `processUnsubscribe` are trusted, actor-less system entrypoints (a provider
webhook; a public one-click link). They run the INV-2/INV-3 cascade (insert the suppression, stop
the company's enrolments, suppress open leads) **directly** with core building blocks rather than
through `compliance.addSuppression`, because `addSuppression` gates on the `acquisition.suppression.add`
permission, which a SYSTEM actor can satisfy only once a job/subscriber with that `systemAction` is in
the manifest. The outbound-webhook job may be given that `systemAction` at integration and switched to
call `addSuppression`; the current cascade is equivalent (same suppression row, same stop, same lead
transition) and is covered by the integration tests.

## CR-12-05 — SMTP transport dependency (type: dependency; owner: Phase 1 `package.json`)

Phase 12 cannot add an npm dependency (`package.json` is Phase 1's; Phase 12 has no grant, and the
ownership guard enforces it). The generic SMTP `EmailSender` fallback (ADR-016) therefore ships as a
typed stub that refuses to send (`email/sender/smtp.ts`); the ADR's **primary** sender, `gmail-api`,
is fully implemented and needs no dependency. When SMTP is actually wired (go-live), Phase 1 adds a
transport dependency (e.g. `nodemailer` + `@types/nodemailer`) and Phase 21 completes the stub's
`send`. Nothing selects `smtp` until an operator sets `OUTREACH_SENDER=smtp` with `MOCKS=false`.

## Dependencies added

None (the `nodemailer` dependency was reverted; see CR-12-05).

## Env

No new environment variables. `UNSUBSCRIBE_TOKEN_SECRET`, `BOOKING_LINK_SECRET`, `OUTREACH_SENDER`,
`INBOUND_SOURCE` and the Google Workspace OAuth variables were already provisioned in `src/env.ts`
(Phase 1).

## Schema

None. Phase 2 already created every outreach model and enum. No migration requested.
