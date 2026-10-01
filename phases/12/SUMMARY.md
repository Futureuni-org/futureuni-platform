# Phase 12: Outreach Engine: Summary

| | |
|---|---|
| Phase | 12, Outreach Engine |
| Branch | `phase/12-outreach` |
| Batch / wave | B4 / Wave 3 |
| Date finished | 2026-10-01 |
| Prompt | `docs/prompts/wave-3/phase-12-outreach.md` |
| Verification | `pnpm check`: Pass · `pnpm test:e2e`: Not run (no new e2e; the unsubscribe page is covered by integration + manual steps) · `saas-review`: no open Critical/Major |

## What was built

The outreach engine: AI drafting with citation enforcement, the approval queue, the sequence engine,
the single email send path (mailboxes, warm-up, rotation, health auto-pause, DNS checks, bounces,
the outbound webhook and one-off email), assisted WhatsApp/LinkedIn/call channels, and RFC 8058
one-click unsubscribe with a public page. It enforces invariants 2, 3, 4, 5, 6, 7, 8, 9, 18, 22, 23
and 25 (M12-AC1…AC10). No internal UI — Phase 15 builds the review screen and Phase 18 the mailbox
settings on these services. Everything works end to end with mocks (`MOCKS=true`).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/outreach/_seams.ts` | Consumed-seam stand-ins (LEAD-BRIEF, THROTTLE, CROSSSELL, BOOKING-LINK) |
| `src/modules/acquisition/outreach/draft/` | `acquisition.outreach-draft` + `-edit` tasks, `createDraft`, validators |
| `src/modules/acquisition/outreach/review/` | approval queue, approve/edit/reject/regenerate/snooze/stream, auto-send, propose-enrolment |
| `src/modules/acquisition/outreach/sequences/` | `enroll`, the tick, stop/pause seams, sequence materialisation |
| `src/modules/acquisition/outreach/email/` | the single send path, sender adapters, MIME/footer, send windows, bounces, one-off |
| `src/modules/acquisition/outreach/mailboxes/` | add/update/pause/list, warm-up, rotation, health, DNS |
| `src/modules/acquisition/outreach/assisted/` | WhatsApp/LinkedIn/call (human always sends) |
| `src/modules/acquisition/outreach/unsubscribe/` | signed tokens + one-click processing |
| `src/modules/acquisition/outreach/{jobs,schedules,settings,notifications,subscribers}.ts` | manifest registration arrays |
| `src/app/api/unsubscribe/[token]/route.ts` | RFC 8058 one-click POST endpoint (no session) |
| `src/app/(public)/u/[token]/` | the public unsubscribe page + confirm component |
| `src/app/api/webhooks/outbound/[provider]/route.ts` | signed provider delivery/bounce/complaint webhook |
| `runtime-skills/acquisition/outreach-draft/`, `outreach-draft-edit/` | the drafting SKILL.md files |
| `evals/acquisition/outreach-draft/`, `outreach-draft-edit/` | eval cases + mock fixtures |

## Public interfaces other phases can use

All from `@/modules/acquisition/outreach`:

```ts
// Drafting + review (Phase 15 UI)
createDraft(actor, { leadId, contactId?, stepIndex, transition?, system? }): Promise<CreateDraftResult>;
getReviewQueue(actor, { serviceLine?, market?, ownerId?, needsHumanReview?, complianceReview?, cursor?, limit? }): Promise<{ items; nextCursor }>;
approveMessage(actor, messageId, { humanConfirmedClaims?, now? }): Promise<{ messageId; scheduledFor }>;  // message.approve (+canApprove)
editMessage(actor, messageId, { subject, body }): Promise<void>;                                          // message.draft
rejectMessage(actor, messageId, { reason, note?, disqualifyLead? }): Promise<void>;                       // message.reject
regenerateMessage(actor, messageId, { instruction? }): Promise<{ messageId }>;                            // message.draft
snoozeLead(actor, leadId, until): Promise<void>;                                                          // lead.update
streamDraftEdit(actor, messageId, instruction): Promise<ReadableStream<StreamTaskEvent>>;                 // message.draft
autoApproveIfEligible(messageId, now?): Promise<{ approved; reason? }>;                                    // system

// Sequences (provided seams)
enroll(tx, leadId, contactId): Promise<EnrollResult>;
stopEnrollments(tx, scope, reason): Promise<{ stopped }>;      // SEAM-STOP-SEQUENCE
pauseEnrollment(tx, leadId, until, reason): Promise<void>;     // SEAM-PAUSE-SEQUENCE
proposeEnrollment(actor, { leadId, contactId, reason }): Promise<{ draftMessageId }>;  // SEAM-PROPOSE-ENROLLMENT
runOutreachTick(now?): Promise<TickResult>;  dispatchDueSends(now): Promise<number>;

// Email (single send path + provided seams)
sendEmailMessage(messageId, { now? }): Promise<SendOutcome>;   // the only outreach-email sender
sendOneOffEmail(actor, input): Promise<{ messageId }>;         // SEAM-SEND-ONEOFF (message.sendOneOff)
recordBounce(tx, input): Promise<void>;                        // SEAM-RECORD-BOUNCE

// Mailboxes
addMailbox / updateMailbox / pauseMailbox (actor) ; listActiveMailboxes(): Promise<ActiveMailbox[]>;  // SEAM-MAILBOXES
getMailboxHealth(actor, id); evaluateMailboxHealth(id, now?); checkDomainDns(actor, domain);

// Assisted (message.sendAssisted)
prepareWhatsApp(actor, messageId); prepareLinkedIn(actor, messageId); createCallTask(actor, messageId);
markAssistedSent(actor, messageId, { sentAt, note?, callOutcome? });

// Unsubscribe
processUnsubscribe(token, { reason? }): Promise<{ ok; alreadyDone }>;
signUnsubscribeToken(payload); verifyUnsubscribeToken(token);
```

- **Jobs:** `acquisition.outreach.tick` (every 5 min), `acquisition.outreach.send`,
  `acquisition.outreach.mailbox-health`, `acquisition.outreach.dns-check`.
- **Schedules:** `outreach-tick` `*/5 * * * *`, `outreach-mailbox-health` `0 7 * * *`,
  `outreach-dns-check` `30 6 * * *` (Africa/Lagos).
- **Events emitted:** `message.drafted`, `message.approved`, `outreach.enrolled`,
  `outreach.step.sent`, `outreach.enrollment.stopped`, `outreach.bounce.recorded`, `mailbox.paused`,
  plus `lead.statusChanged` after each owned transition.
- **Settings:** `acquisition.outreach.globalPause` (default false; Phase 21 bootstraps production
  `true` until launch gates pass), `acquisition.unsubscribeScope` (COMPANY), send-window
  start/end/jitter, warm-up start-cap/target/ramp, bounce threshold, health sample size, DKIM
  selector, click tracking (off). Postal address is read from the platform setting
  `platform.postalAddress`.
- **Notification types:** `mailbox.paused` (critical, IN_APP+EMAIL). `review.queue-waiting` (platform
  type) is routed by the `message.drafted` subscriber.
- **AI tasks:** `acquisition.outreach-draft`, `acquisition.outreach-draft-edit` (balanced tier).
- **Routes:** `POST /api/unsubscribe/[token]`, `GET /u/[token]`, `POST /api/webhooks/outbound/[provider]`.

## Lead transitions owned (module spec §5.2)

`SCORED → IN_REVIEW` (first-touch draft), `IN_REVIEW → APPROVED` (approve), `IN_REVIEW → SCORED`
(reject-to-regenerate), `IN_REVIEW → DISQUALIFIED` (reject-disqualify), `APPROVED → CONTACTED` (sent),
`APPROVED → IN_REVIEW` (send blocked by a compliance change or dismissed citation).

## Decisions made

- **Citations handled in `draft.ts`, not via the task's `claims` policy.** The mock fixture carries
  `__CITE1__` sentinels that `createDraft` rewrites to the lead's real finding ids, so the mock path
  produces valid citations for any lead; `assertClaimsCited` then runs over the final body (INV-5).
- **`recordBounce`/`processUnsubscribe` run the INV-2/INV-3 cascade directly** (see REQUESTS CR-12-04).
- **Idempotent inserts inside a transaction use `withSavepoint`**, so a unique-index conflict does
  not abort the surrounding transaction.
- Proposed ADR: none.

## Dependencies added

None. (A `nodemailer`-based SMTP adapter was prototyped then reverted — `package.json` is owned by
Phase 1 and Phase 12 has no dependency grant. See REQUESTS CR-12-05: the SMTP fallback ships as a
typed stub; the transport dependency is added by Phase 1 and the adapter completed at go-live. The
ADR-016 **primary** sender `gmail-api` is fully implemented with no dependency, via `fetch`.)

## Change requests raised

See `phases/12/REQUESTS.md`: CR-12-01 manifest wiring (service gap), CR-12-02 seam wiring, CR-12-03
contract `tx` type note, CR-12-04 bounce/unsubscribe cascade note.

**Seams:** all consumed seams were **stubbed** (providers 11 and 14 run in parallel) — see
`_seams.ts` and CR-12-02. All provided seams are **implemented** to the Part B2 signatures.

## Known limitations

- **Evals run structurally in mock mode.** The suite (11 draft cases spanning both markets and the
  required traps — missing-fact, injection, UK no-consent, NG WhatsApp, follow-up, cross-sell,
  low-severity — plus 2 edit cases) validates schema, banned phrases, no exclamation marks and
  injection-not-echoed against the deterministic mock fixture. Per-case output precision (claim
  precision, channel tone) is only meaningful on a live run (`EVALS_LIVE`); tuning the published
  prompt and expanding to 10 cases per line is a Phase 20/21 task.
- **`gmail-api` is written to the Gmail REST API but not exercised in-phase** (MOCKS everywhere);
  first validated live in Phase 21. **`smtp` is a typed stub that refuses to send** (REQUESTS
  CR-12-05) — it needs a transport dependency Phase 12 may not add; the fully-implemented `gmail-api`
  is the ADR-016 primary.
- **Click tracking** is off (ADR-031); enabling it needs a new ADR.

## How to test it

- `pnpm check` (lint, typecheck, unit + integration tests, build).
- Outreach tests only: `pnpm test src/modules/acquisition/outreach` (45 unit + 7 integration).
- Manual (dev, `MOCKS=true`): seed a SCORED international lead with a pitchable finding and a VALID
  contact, an active mailbox, and set `platform.postalAddress`; then `createDraft` → `approveMessage`
  → `sendEmailMessage({ now })` lands in the mock sender with the footer, `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers, and the lead reaches CONTACTED. POST a signed token to
  `/api/unsubscribe/<token>` → a suppression is added and enrolments stop; `/u/<token>` confirms.

## Before sending for real (Phase 21 launch gate)

Nothing below is exercised while `MOCKS=true`. Before any real prospect is contacted:

1. **Dedicated outreach Google Workspace tenant** with 2–3 secondary domains, 1–2 mailboxes each; an
   **Internal** OAuth app with `gmail.send` + `gmail.readonly` (ADR-016). Store refresh tokens in the
   credentials vault under `outreach-mailbox:<mailboxId>`.
2. **DNS per domain:** SPF **and** DKIM (Google selector) with **aligned DMARC**, valid PTR, TLS, MX.
   Run `checkDomainDns` for each and fix every FAIL. Gmail/Yahoo reject non-compliant bulk mail and
   require RFC 8058 one-click unsubscribe honoured within 48h.
   - Gmail/Yahoo sender requirements: https://support.google.com/a/answer/81126
   - Workspace sending limits: https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
   - Gmail API send: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
   - RFC 8058 (one-click `List-Unsubscribe-Post`): https://www.rfc-editor.org/rfc/rfc8058
   - WhatsApp click-to-chat: https://faq.whatsapp.com/5913398998672934
3. **Warm-up:** confirm each mailbox's `warmupStartDate`/caps; a new tenant is capped at 500/day until
   $100 is paid. Keep the manual ramp (5 → 30–40/day).
4. **Verify by test** that Gmail preserves our `List-Unsubscribe` headers and DKIM covers them (send
   to a test Gmail account, check "Show original").
5. **Set `platform.postalAddress`** (INV-4 blocks all sends while empty) and keep
   `acquisition.outreach.globalPause = true` until the `docs/launch-checklist.md` compliance gates
   (Nigerian counsel on GAID Art. 18/26, general legal review of the country-rules table) are ticked.
