# Outreach (Phase 12)

How FUTUREUNI reaches out: truthfully, compliantly, and in a way that protects its sending domains.
Backend only — the UI is Phase 15 (review queue) and Phase 18 (mailbox settings), plus the one
public page here (`/u/[token]`).

## Areas

- `draft/` — the `acquisition.outreach-draft` task, `createDraft`, and the channel/link/banned-phrase
  validators. Citations (INV-5) are enforced in `draft.ts`; the mock fixture uses `__CITE1__`
  sentinels that are rewritten to the lead's real finding ids.
- `review/` — the approval queue: `approveMessage`, `editMessage`, `rejectMessage`,
  `regenerateMessage`, `snoozeLead`, `streamDraftEdit`, `autoApproveIfEligible`, `proposeEnrollment`.
- `sequences/` — `enroll`, the tick (`runOutreachTick`), and the stop/pause seams.
- `email/` — the **single send path** `sendEmailMessage` (every email goes through it), the sender
  adapters (`gmail-api`, `smtp`, `mock`), MIME + footer, send windows, bounces and one-off email.
- `mailboxes/` — add/update/pause/list, warm-up caps, rotation, health auto-pause and DNS checks.
- `assisted/` — WhatsApp, LinkedIn and call tasks (a human always sends; INV-7).
- `unsubscribe/` — signed RFC 8058 tokens and one-click processing.

## Invariants enforced here

2 (suppression in the send path), 3 (reply/bounce/unsubscribe stops the company), 4 (footer +
unsubscribe headers + postal address), 5 (every claim cited; human-edited text needs a
confirmation), 6/25 (contactability gates email), 7 (no WhatsApp/LinkedIn API sending), 8 (send
window + cap + warm-up), 9 (one active/paused thread per company), 18 (dismissed finding can't be
cited), 22 (idempotent by messageId), 23 (unsubscribe before any further send), 24 (untrusted
content delimited).

## Seams

Provides `stopEnrollments`, `pauseEnrollment`, `proposeEnrollment`, `sendOneOffEmail`,
`recordBounce`, `listActiveMailboxes`. Consumes (stubbed in `_seams.ts` until Wave 3 integration)
`getLeadBrief`, `getOutreachThrottle`, `getCrossSellContext` (Phase 11) and `getBookingLink`
(Phase 14).

Registration arrays (`outreachJobs`, `outreachSchedules`, `outreachSettings`,
`outreachNotifications`, `outreachSubscribers`, `outreachAiTasks`) are wired into the module
manifest by Phase 19 — see `phases/12/REQUESTS.md`.
