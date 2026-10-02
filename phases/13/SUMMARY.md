# Phase 13: Reply Inbox: Summary

| | |
|---|---|
| Phase | 13, Reply Inbox |
| Branch | `phase/13-inbox` |
| Batch / wave | B5 / Wave 3 |
| Date finished | 2026-10-01 |
| Prompt | `docs/prompts/wave-3/phase-13-inbox.md` |
| Verification | `pnpm check`: Pass — typecheck (whole project), lint (inbox + webhook scope), unit + integration tests (46) and `pnpm build` all green; verified in stages because the single combined run was stopped once by host memory pressure · `pnpm test:e2e`: Not run (no UI; Phase 16 builds the inbox screens) · `saas-review`: no open Critical/Major (2 Major fixed: INV-5 draft citation check, reply-event channel) |

## What was built

The reply inbox back end (no UI): **ingestion** of replies from the outreach mailboxes
(`InboundReplySource` with `gmail-api`, `imap` and `mock`), normalisation (safe HTML→text, quoted
history and signature stripping into `latestText`, header subset, attachment metadata), five-step
**matching** to a lead/contact/message with idempotent storage and unmatched linking;
**classification** (deterministic rules for DSN bounces, RFC 3834 auto-replies and stop-language,
then the `acquisition.inbox-classify` model with extraction and a safety bias to `UNSUBSCRIBE`);
per-class **actions** (stop/pause the sequence, suppress, nurture, propose a referral, record a
bounce, notify) with the correct lead transitions in one transaction; **routing and SLAs** (owner by
free capacity, a 4-business-hour timer with warning and breach escalation); AI-**drafted responses**
sent by a human through the outreach one-off path; **assisted-channel** reply logging; and the
**inbox services** and counts for Phase 16. It honours INV-2, INV-3, INV-5, INV-12, INV-22, INV-23
and INV-24 and implements AC-27.1/.2/.3 and AC-28.1. Everything runs end to end with mocks.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/inbox/_shared.ts` | Logger, `notifySafe`, `publishStatusChanged`. |
| `src/modules/acquisition/inbox/inbox.repo.ts` | All Prisma access (cursors, idempotent reply store, matching queries, reply/thread/SLA writes, draft message + citations, suppression cascade building blocks, read queries). |
| `src/modules/acquisition/inbox/normalize/{html-to-text,strip-quotes,index}.ts` | Safe HTML→text, quote/signature stripping, body + header-subset normalisation. |
| `src/modules/acquisition/inbox/ingest/{source,mock,gmail-api,imap,ingest}.ts` | `InboundReplySource` adapters, source selector, matching + idempotent ingest + poll. |
| `src/modules/acquisition/inbox/classify/{rules,schemas,classify,follow-up}.ts` | Deterministic rules, AI task schemas, classification orchestration, follow-up date resolution. |
| `src/modules/acquisition/inbox/actions/{actions,process,nurture}.ts` | Per-class action runner, the process orchestrator + `reclassify`, the nurture-reminder scan. |
| `src/modules/acquisition/inbox/routing/{sla,routing,sla-check}.ts` | Business-hours SLA maths, owner routing + assignment/snooze, the SLA-check scan. |
| `src/modules/acquisition/inbox/draft/{schemas,draft}.ts` | Reply-draft schema, `generateReplyDraft` and `sendReply`. |
| `src/modules/acquisition/inbox/{assisted,services,tasks,settings,jobs,schedules,notifications,subscribers,index}.ts` | Assisted replies, inbox services, AI task defs, settings, manifest registration leaves, barrel. |
| `src/app/api/webhooks/inbound/[provider]/route.ts` | Optional Gmail push endpoint (verify → dedupe → enqueue poll). |
| `runtime-skills/acquisition/inbox-classify/SKILL.md`, `inbox-draft-reply/SKILL.md` | The two AI task prompts. |
| `evals/acquisition/inbox-classify/` (43 cases), `inbox-draft-reply/` (11 cases) + fixtures | Classification and draft eval suites. |
| `src/modules/acquisition/inbox/**/*.test.ts`, `inbox.integration.test.ts` | Unit + integration tests. |

## Public interfaces other phases can use

All from `@/modules/acquisition/inbox`:

```ts
// Inbox services (Phase 16 UI + platform home) — permission acquisition.inbox.read / .assign / .link
listThreads(actor, { serviceLine, market?, classification?, unread?, ownerId?, needsHumanReview?, slaStatus?, cursor?, limit? }): Promise<{ items: ThreadListItem[]; nextCursor: string | null }>;
getThread(actor, leadId): Promise<{ messages; replies }>;
markRead(actor, leadId); markUnread(actor, leadId);
getUnmatchedReplies(actor): Promise<{ id; fromAddress; subject; summary; receivedAt }[]>;
linkReply(actor, replyId, leadId): Promise<void>;           // acquisition.inbox.link, then re-processes
getInboxCounts(actor, userId): Promise<{ byLine; totalUnread; totalActionable }>;
assignThread(actor, leadId, userId): Promise<void>;          // acquisition.inbox.assign
snoozeThread(actor, leadId, until | null): Promise<void>;

// Drafted responses — acquisition.inbox.reply
sendReply(actor, replyId, { subject?, body, humanConfirmedClaims }, clock?): Promise<{ messageId }>;  // → sendOneOffEmail
generateReplyDraft(args, actor): Promise<{ messageId; needsPricingApproval } | null>;

// Classification + processing (jobs, tests, integration) — acquisition.inbox.reclassify for reclassify
processReply(replyId, clock): Promise<{ status }>;
reclassify(actor, replyId, newClass, note, clock?): Promise<void>;
logAssistedReply(actor, { leadId, channel, text, receivedAt? }, clock?): Promise<{ replyId }>;  // acquisition.inbox.logAssisted

// Ingestion (job entrypoint + test helpers)
pollAllMailboxes(clock); ingestMailbox(mailbox, internal, clock); matchInbound(email);
enqueueMockReplies(address, messages); resetMockReplies();
inboxAiTasks; ensureInboxTasksRegistered();
```

- **Jobs:** `acquisition.inbox.poll` (5 min), `acquisition.inbox.process` (per reply),
  `acquisition.inbox.sla-check` (15 min), `acquisition.inbox.nurture-reminders` (daily).
- **Schedules:** `inbox-poll`, `inbox-sla-check`, `inbox-nurture-reminders` (Africa/Lagos).
- **Settings:** `acquisition.inbox.{slaBusinessHours,confidenceThreshold,defaultNurtureDays,outOfOfficeFallbackDays}`; reuses `acquisition.unsubscribeScope` (Phase 12).
- **Notification types:** `reply.interested` (critical), `reply.needs-action`, `reply.sla-warning`, `reply.sla-breached`, `nurture.follow-up-due`.
- **Events emitted:** `reply.received`, `reply.classified`; plus `lead.statusChanged`, `lead.assigned`, `compliance.suppressed` from the owned actions.
- **AI tasks:** `acquisition.inbox-classify` (fast), `acquisition.inbox-draft-reply` (balanced).
- **Route:** `POST /api/webhooks/inbound/[provider]`.

## Lead transitions owned (module spec §5.2)

`CONTACTED → REPLIED` (interested/question/objection/other/wrong-person); `CONTACTED/REPLIED → NURTURE`
(reason `NOT_NOW`); `→ SUPPRESSED` for the company's open leads on an unsubscribe. Out-of-office pauses
the enrolment (no transition); bounces record a bounce (no transition).

## Decisions made (and any new ADRs proposed)

- **Company-scope stop (INV-3) over the prompt's `{ leadId }` wording** — see REQUESTS CR-13-03.
- **Unsubscribe/bounce suppression cascade runs directly** (actor-less), mirroring Phase 12's
  CR-12-04, so the automatic SYSTEM path works before the inbox jobs are on the manifest — CR-13-04.
- **`imap` ships as a typed stub** (no dependency grant), like Phase 12's `smtp` — CR-13-05. The
  ADR-016 primary `gmail-api` is fully implemented via `fetch`.
- **Owner notifications route through an `inbox/subscribers.ts` subscriber on `reply.classified`**
  with per-reply dedupe keys, matching the events.md §3a "(router)" annotation and Phase 12's pattern.
- No new ADRs proposed. Current docs verified 2026-10-01: Gmail `users.history.list` (404 → full
  sync), RFC 3834 (`Auto-Submitted`), RFC 3464 (DSN `multipart/report`, `Status` 5.x.x/4.x.x).

## Dependencies added

None.

## Change requests raised

See `phases/13/REQUESTS.md`: CR-13-01 manifest wiring (+ process-job systemActions), CR-13-02 seams
(all REAL — no stand-ins), CR-13-03 company-scope stop note, CR-13-04 direct suppression cascade note,
CR-13-05 `imap` stub (dependency), CR-13-06 inbound webhook secret (deploy).

**Seams:** all six consumed from Phase 12 (`stopEnrollments`, `pauseEnrollment`, `proposeEnrollment`,
`sendOneOffEmail`, `recordBounce`, `listActiveMailboxes`) and `getBookingLink` from Phase 14 are
**real** — both providers were merged on `main`. No `_seams.ts`; `grep -r "SEAM:" src` is clean.

## Known limitations

- **`gmail-api` and `imap` are not exercised in-phase** (MOCKS everywhere). `gmail-api` is written to
  the REST API but first validated live in Phase 21; `imap` is a typed stub (CR-13-05).
- **Evals authored, not executed.** The repo-wide eval-runner `createContext` crash (noted in the
  Wave-2/Phase-14 summaries) still blocks `pnpm evals`; the suites use `schemaValid` + `exactMatch`
  expectations (including the `UNSUBSCRIBE`-recall and below-min-budget / unoffered-service cases) for
  a live run once the harness is unblocked. UNSUBSCRIBE recall is also enforced deterministically by
  the Stage-1 stop-language rule and the model safety bias.
- **WhatsApp-specific reply drafts** (≤ 600 chars, WhatsApp channel) are not yet produced; assisted
  replies are classified and actioned the same way, and the suggested draft is the email draft holder.
- **Referral draft under the automatic SYSTEM path** is best-effort until the process job's
  `systemActions` are live (CR-13-01); the verified referral contact is always created.
- Push ingestion verification (Pub/Sub OIDC) is a Phase 21 go-live task (CR-13-06).

## How to test it

- `pnpm check` — lint, typecheck, unit + integration tests, build.
- Unit (no DB): `pnpm exec vitest run src/modules/acquisition/inbox/normalize src/modules/acquisition/inbox/classify src/modules/acquisition/inbox/routing/sla.test.ts` — quote/signature stripping, HTML→text, DSN/auto-reply/unsubscribe rules, follow-up date resolution, business-hours SLA.
- Integration (needs Postgres; `pnpm db:up`): `pnpm exec vitest run src/modules/acquisition/inbox/inbox.integration.test.ts` — matching by In-Reply-To, re-poll dedupe, every class action/transition (UNSUBSCRIBE suppress+stop+SUPPRESSED, OOO pause, BOUNCE suppress+invalid, INTERESTED → REPLIED + SLA + draft, NOT_NOW → NURTURE, WRONG_PERSON referral), reclassify → UNSUBSCRIBE, unmatched linking, `sendReply` → `sendOneOffEmail`, and line-scoped permission denial.
- All services run in `MOCKS=true` (AI via fixtures, the mock inbound source, the mock send path).
