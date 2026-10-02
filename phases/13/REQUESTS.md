# Phase 13 — change requests

Applied at Wave 3 / batch B5 integration (`docs/prompts/wave-3/wave-3-prep-and-merge.md`, Part C3).

## CR-13-01 — Manifest wiring (type: service gap; owner: Phase 19, `M/manifest.ts`)

Phase 13 cannot edit `src/modules/acquisition/manifest.ts` (owned by 19). Import the inbox
registration arrays from their **leaf files** (not the `index.ts` barrel — the barrel pulls runtime
code that imports `@/platform/ai`, which would form a manifest ↔ registry cycle) and spread them in,
exactly as outreach/pipeline are wired:

```ts
import { inboxJobs } from "./inbox/jobs";
import { inboxSchedules } from "./inbox/schedules";
import { inboxSettings } from "./inbox/settings";
import { inboxNotifications } from "./inbox/notifications";
import { inboxSubscribers } from "./inbox/subscribers";
import { inboxAiTasks } from "./inbox/tasks";
// …
jobs: [..., ...inboxJobs],
schedules: [..., ...inboxSchedules],
settings: [..., ...inboxSettings],
subscribers: [..., ...inboxSubscribers],
aiTasks: [..., ...inboxAiTasks],
notificationTypes: [..., ...inboxNotifications],
```

All `acquisition.inbox.*` permissions and the `inbox` nav section and `acquisition.my-inbox` home
widget are already in the manifest (Phase 0/2). No permission change is needed; Phase 19's
manifest ↔ matrix test stays green.

**Process-job `systemActions` (production).** `acquisition.inbox.process` runs as a SYSTEM actor and
calls `proposeEnrollment` (WRONG_PERSON referrals), which asserts `acquisition.message.draft`. The job
already declares `systemActions: ["acquisition.suppression.add", "acquisition.message.draft"]`. Once
the job is on the manifest, `assertActorCan` resolves these; until then (and in unit tests) the
referral draft is attempted best-effort and skipped on `FORBIDDEN` (the verified contact is still
created). No change needed beyond registering the job.

## CR-13-02 — Seams (type: seam wiring; all REAL — nothing to connect)

Phases 12 and 14 were already merged on `main` when Phase 13 ran, so per the seam rule every consumed
seam calls the **real** implementation directly — there is no `_seams.ts` and `grep -r "SEAM:" src`
is clean for Phase 13.

| Seam | Provider | Called via |
|---|---|---|
| `SEAM-STOP-SEQUENCE` | 12 | `stopEnrollments` from `@/modules/acquisition/outreach` |
| `SEAM-PAUSE-SEQUENCE` | 12 | `pauseEnrollment` from `@/modules/acquisition/outreach` |
| `SEAM-PROPOSE-ENROLLMENT` | 12 | `proposeEnrollment` from `@/modules/acquisition/outreach` |
| `SEAM-SEND-ONEOFF` | 12 | `sendOneOffEmail` from `@/modules/acquisition/outreach` |
| `SEAM-RECORD-BOUNCE` | 12 | `recordBounce` from `@/modules/acquisition/outreach` |
| `SEAM-MAILBOXES` | 12 | `listActiveMailboxes` from `@/modules/acquisition/outreach` |
| `SEAM-BOOKING-LINK` | 14 | `getBookingLink` from `@/modules/acquisition/pipeline` (lazy import, cycle-safe) |

## CR-13-03 — Company-scope stop reconciliation (type: note; no change required)

The prompt's Step 3 writes the first stop as `stopEnrollments({ leadId }, "REPLY")`, but **INV-3**, the
outreach-channel contract (rule 13) and module spec §3.12 all require the stop to be **company-wide**.
Phase 13 stops at `{ companyId }` to satisfy INV-3. Flagging only; the prompt wording is looser than
the invariant.

## CR-13-04 — Unsubscribe / bounce cascade runs directly (type: note; no change required)

The reply-`UNSUBSCRIBE` path runs the INV-2/INV-3/INV-23 cascade **directly** (insert the suppression,
stop the company's enrolments, move open leads to `SUPPRESSED`, emit `compliance.suppressed`, audit)
rather than through the permission-gated `compliance.addSuppression`, exactly as Phase 12 does for
`recordBounce`/`processUnsubscribe` (CR-12-04): a SYSTEM actor can satisfy `acquisition.suppression.add`
only once its job is on the manifest. The cascade is equivalent and is covered by the integration
tests. `BOUNCE` replies call the real `recordBounce` (which runs its own cascade). Integration may
later switch the human `reclassify → UNSUBSCRIBE` path to `addSuppression` (the actor is a USER there).

## CR-13-05 — IMAP reply source ships as a typed stub (type: dependency; owner: Phase 1 `package.json`)

The generic `imap` fallback source (ADR-016) needs an IMAP transport dependency, and `package.json` is
Phase 1's (no grant; the ownership guard enforces it). Mirroring Phase 12's `smtp` stub (CR-12-05),
`inbox/ingest/imap.ts` ships as a typed stub that throws `PROVIDER_ERROR`. The ADR-016 **primary**
source `gmail-api` is fully implemented via `fetch` (no dependency), and `mock` drives development and
tests. At go-live Phase 1 adds the transport dependency and Phase 21 completes the stub.

## CR-13-06 — Inbound push webhook secret (type: deploy/secret; owner: Phase 21)

Optional Gmail `watch` push arrives at `POST /api/webhooks/inbound/[provider]`. The handler verifies a
Bearer token against the provider's vault secret (via `resolveProviderKey`) and, with `MOCKS=false` and
no secret configured, rejects. Full Pub/Sub OIDC verification and the shared secret are a Phase 21
go-live task (like `CALCOM_WEBHOOK_SECRET`). Polling every 5 minutes is the reliable path; push only
shortens latency, so nothing breaks without it.

## Exports to register (summary of B3)

- **Jobs:** `acquisition.inbox.poll`, `acquisition.inbox.process`, `acquisition.inbox.sla-check`,
  `acquisition.inbox.nurture-reminders` (`inboxJobs`).
- **Schedules:** `inbox-poll` `*/5 * * * *`, `inbox-sla-check` `*/15 * * * *`,
  `inbox-nurture-reminders` `0 7 * * *` (Africa/Lagos) (`inboxSchedules`).
- **Settings:** `acquisition.inbox.slaBusinessHours`, `.confidenceThreshold`, `.defaultNurtureDays`,
  `.outOfOfficeFallbackDays` (`inboxSettings`). The unsubscribe scope reuses Phase 12's shared key
  `acquisition.unsubscribeScope` (read, not redeclared).
- **Notification types:** `reply.interested`, `reply.needs-action`, `reply.sla-warning`,
  `reply.sla-breached`, `nurture.follow-up-due` (`inboxNotifications`) — already catalogued in
  `docs/contracts/events.md` §3a, so no contract change.
- **Subscribers:** `acquisition.inbox.notify-on-classified` on `reply.classified` (`inboxSubscribers`).
- **AI tasks:** `acquisition.inbox-classify` (fast), `acquisition.inbox-draft-reply` (balanced)
  (`inboxAiTasks`).
- **Routes:** `POST /api/webhooks/inbound/[provider]`.
- **Events emitted:** `reply.received`, `reply.classified`, plus `lead.statusChanged`, `lead.assigned`
  and `compliance.suppressed` where the owned actions cause them.

## Schema

None. Phase 2 already created `Reply`, `MailboxSyncState`, `ReplyCorrection`, `InboxThread` and every
inbox enum (`ReplyClass`, `ReplyChannel`, `ReplyMatchMethod`, `ClassificationSource`, `SlaStatus`). No
migration requested.

## Env

None. `INBOUND_SOURCE` and the Google Workspace OAuth variables were already provisioned by Phase 1.

## Dependencies added

None.
