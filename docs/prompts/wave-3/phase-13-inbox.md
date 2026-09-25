# Phase 13: Reply Inbox

> **How to run this phase**
> 1. Wave 2 must be merged and integrated, and Part A of `wave-3-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 13 inbox`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-13-inbox.md and execute it. Plan first."**
>
> Wave 3. Runs in parallel with Phases 11, 12 and 14. Depends on Waves 0–2.

---

## Your role and the goal of this phase

Many outreach systems lose money here, because replies land in an inbox nobody triages fast. You build the part that makes sure **every reply is caught, understood, acted on and answered quickly by the right person**:

1. **Ingestion:** pull replies from the outreach mailboxes, and match each one to its lead, contact and message.
2. **Classification:**
   - deterministic rules first (auto-replies, bounces, clear unsubscribes)
   - then Claude
   - and extraction: follow-up dates, referrals, objections, questions
3. **Actions by class:**
   - stop or pause the sequence
   - suppress
   - nurture until a date
   - propose outreach to a referred person
   - notify the owner
4. **Routing and SLAs:** the right owner, a response-time target, reminders and escalation.
5. **Drafted responses:** Claude drafts, and a human sends through the outreach send path.
6. **Assisted-channel replies:** log a WhatsApp or LinkedIn reply by pasting it, and it gets classified and actioned the same way.

**No UI.** Phase 16 builds the inbox screens on your services.

---

## Step 0: Read first

1. `CLAUDE.md`, and `.claude/project-rules.md`, especially invariants 2, 3 and 12 and the bans
2. `docs/decisions.md`: the cold-outreach sending ADR decides how replies are ingested (Gmail API history or watch, IMAP, or the sending platform's webhook or API)
3. `docs/specs/module-acquisition.md`: the reply classes, default actions and inbox sections
4. `docs/contracts/outreach-channel.md` (`InboundReplySource`) and `events.md`
5. **`docs/prompts/wave-3-prep-and-merge.md`:** you consume `SEAM-STOP-SEQUENCE`, `SEAM-PAUSE-SEQUENCE`, `SEAM-PROPOSE-ENROLLMENT`, `SEAM-SEND-ONEOFF`, `SEAM-RECORD-BOUNCE`, `SEAM-MAILBOXES` and `SEAM-BOOKING-LINK`. You own the Phase 13 transitions in B1.
6. The READMEs of:
   - `@/modules/acquisition/compliance` (`addSuppression`, the contactability verdict)
   - `@/modules/acquisition/enrichment` (the email verifier, for referrals)
   - `@/modules/acquisition/profiles`
   - `@/modules/acquisition/core`
   - `@/platform/directory`
   - `@/platform/ai`, `@/platform/jobs`, `@/platform/notifications`, `@/platform/team`, `@/platform/settings`, `@/platform/audit-log`, `@/platform/auth`
7. `phases/*/SUMMARY.md` for every completed phase
8. The global skills `saas-api` (webhooks, dedupe), `saas-ai`, `saas-notify`, `saas-data`, `saas-testing` and `saas-review`

Verify the current docs for the ingestion method in the ADR (for example the Gmail API `users.history.list` or `watch` with Pub/Sub, IMAP IDLE or polling, or the sending platform's reply API or webhooks) and for RFC 3834 (`Auto-Submitted`) and delivery status notifications. Record the source URLs.

---

## What you own

- `src/modules/acquisition/inbox/**`
- `runtime-skills/acquisition/inbox-*/**`
- `evals/acquisition/inbox-*/**`
- `src/app/api/webhooks/inbound/**`
- `phases/13/**`

---

## Step 1: Ingestion (`inbox/ingest/`)

1. **`InboundReplySource` adapter,** per the contract, with implementations:
   - the ADR's method (for example `gmail-api`)
   - `imap`, as a generic fallback
   - `mock`, which injects scripted replies, including every class and edge case
   - Mailboxes come from `SEAM-MAILBOXES`, and credentials from `@/platform/credentials`.
2. **How replies arrive:**
   - **Default: polling.** Job `acquisition.inbox.poll` every 5 minutes through the cron dispatcher, keeping a per-mailbox cursor (history ID or UID) in settings or a small table. Raise a schema request if needed.
   - **Push:** if the ADR's provider supports push (Gmail watch through Pub/Sub, or a platform webhook), add `src/app/api/webhooks/inbound/[provider]`: verify the signature, dedupe by event ID, respond fast, and enqueue processing.
3. **Normalise every inbound email:**
   - store the headers you need (`Message-ID`, `In-Reply-To`, `References`, `From`, `To`, `Date`, `Auto-Submitted`, `X-Autoreply`, `Precedence`, `Content-Type`)
   - the plain-text body, with HTML converted safely to text
   - **strip quoted history and signatures** into a clean `latestText`, keeping the full raw body (sanitised) for reference
   - attachment metadata only; don't download attachments unless a later phase needs them
   - store it as a `Reply` (raw → normalised)
4. **Matching, in this order:**
   1. `In-Reply-To` or `References` matched to our stored provider message IDs
   2. the provider thread ID
   3. the sender address matched to a contact with an active or recent enrolment
   4. the sender domain matched to a company with an active thread
   5. otherwise, **Unmatched**, kept for manual linking with `linkReply(actor, replyId, leadId)`
5. **Idempotency:** a unique key per mailbox and provider message ID, so re-polling never duplicates.
6. **Our own sent mail** (copies in "Sent") and internal addresses are ignored.

---

## Step 2: Classification (`inbox/classify/`)

**Stage 1: deterministic rules** (tested, run first):

- A delivery status notification (`multipart/report; report-type=delivery-status`, or a mailer-daemon sender) is `BOUNCE`. Parse the failed recipient and whether it's hard or soft.
- `Auto-Submitted: auto-replied` or `auto-generated`, or `X-Autoreply`, or common out-of-office subject patterns in English, is `OUT_OF_OFFICE`. Try to extract the return date.
- Clear unsubscribe language ("unsubscribe", "remove me", "stop emailing", "take me off your list", "do not contact") is `UNSUBSCRIBE`.

**Stage 2: Claude.** Register **`acquisition.inbox-classify`** (fast tier). The reply text goes in a data block, with the original message for context.

**Output:**

```ts
{
  classification: "INTERESTED" | "NOT_NOW" | "WRONG_PERSON" | "OBJECTION_PRICE" | "OBJECTION_OTHER" | "QUESTION" | "UNSUBSCRIBE" | "OUT_OF_OFFICE" | "BOUNCE" | "OTHER";
  confidence: number;
  followUpDate: string | null;       // ISO date, resolved from phrases like "next quarter", "after Easter", "in March", relative to the reply date and recipient timezone
  referral: { name: string | null; email: string | null; role: string | null } | null;
  objectionSummary: string | null;
  questions: string[];
  sentiment: "positive" | "neutral" | "negative";
  language: string;
  summary: string;                    // one line for the inbox list
}
```

**Safety bias:**

- If the model sees *any* request to stop contact, even inside another class (for example "not interested, please don't email again"), the result is `UNSUBSCRIBE`.
- Low confidence (below a threshold from settings) is marked `needsHumanReview`. The sequence is **stopped** anyway, because a reply always stops automatic sending.

**Evals:** at least 40 cases across all classes. Include:

- Nigerian English and Pidgin phrases ("abeg", "no wahala", "we go reach you")
- UK politeness that means "no" ("thanks, we're all set for now")
- a sarcastic reply
- a mixed "not now, but talk to Sarah (sarah@…)"
- a forwarded internal note
- a reply with an injection attempt
- a legal threat
- a spam-complaint-style message
- an out-of-office with a return date
- a DSN

Measure **recall on `UNSUBSCRIBE`** specifically, targeting 100% on the suite.

---

## Step 3: Actions (`inbox/actions/`)

Every reply first calls `stopEnrollments({ leadId }, "REPLY")`, **except** `OUT_OF_OFFICE`, which pauses instead. Then the class-specific action runs, in one transaction where possible:

| Class | Action |
|---|---|
| `INTERESTED` | `CONTACTED → REPLIED`. Notify the owner (`reply.interested`, critical). Create an SLA timer. Prepare a suggested response draft including `getBookingLink(leadId)`. |
| `QUESTION` | `→ REPLIED`. Draft an answer (Step 5) from the services catalogue and profile. Flag anything that needs pricing beyond the profile ranges. Notify the owner (`reply.needs-action`). |
| `OBJECTION_PRICE` / `OBJECTION_OTHER` | `→ REPLIED`. Draft a respectful response using the market reference's objection guidance. Notify the owner. |
| `NOT_NOW` | `→ NURTURE`, with `nextActionAt = followUpDate` (or +90 days by default, from settings). Schedule a reminder notification for the owner on that date. Draft an optional short, polite acknowledgement. |
| `WRONG_PERSON` | If a referral email is given: verify it (Phase 9 verifier), upsert the contact through `@/platform/directory`, check contactability, then `proposeEnrollment({ leadId, contactId, reason: "REFERRAL" })`. That creates a draft for review, **never an automatic send**. Draft an optional thank-you to the original person. |
| `UNSUBSCRIBE` | `addSuppression(EMAIL, reason UNSUBSCRIBE)` for the sender, plus a company-level stop per the unsubscribe-scope setting. `→ SUPPRESSED`. **No reply is sent.** Audit it. |
| `OUT_OF_OFFICE` | `pauseEnrollment(leadId, returnDate + 1 business day or +7 days, "OUT_OF_OFFICE")`. Not counted as a reply in analytics. |
| `BOUNCE` | `recordBounce({ providerMessageId, email, kind })`. |
| `OTHER` | `→ REPLIED`. Mark `needsHumanReview`, and notify the owner. |

**Human override:** `reclassify(actor, replyId, newClass, note)` re-runs the actions for the new class safely (idempotent) and stores the correction as feedback for the evals. If the new class is `UNSUBSCRIBE`, suppression is applied immediately. **Moving away from `UNSUBSCRIBE` doesn't remove the suppression automatically;** that needs an explicit `ADMIN` action in the compliance services.

Emit `reply.received` and `reply.classified`.

---

## Step 4: Routing and SLAs (`inbox/routing/`)

- **Owner resolution:**
  1. the lead's owner
  2. otherwise, the line's owners by round robin, weighted by free capacity (`@/platform/team`)
  3. otherwise, the managers
- **SLAs,** in settings: an actionable reply (`INTERESTED`, `QUESTION`, `OBJECTION_*`) must get a first human response within **4 business hours** (in the owner's timezone, during their working hours).
  - At 75% of the SLA, notify the owner.
  - At breach, notify the owner and the managers.
  - Record the SLA outcome for analytics.
- **Services:** `assignThread(actor, leadId, userId)` and `snoozeThread(actor, leadId, until)`.

---

## Step 5: Drafted responses (`runtime-skills/acquisition/inbox-draft-reply`)

Register **`acquisition.inbox-draft-reply`** (balanced tier).

- **Input:**
  - the thread (our messages and their replies), the classification and extraction
  - the lead brief, findings with IDs, pricing ranges and packages from the profile, the booking link
  - the line and market references
  - the owner's name
- **Output:** `{ subject: string | null, body: string, citedFindingIds: string[], needsPricingApproval: boolean, notes: string }`
- **Rules:**
  - Validate with `assertClaimsCited`.
  - Never commit to prices outside the profile ranges, never promise timelines outside the catalogue, never invent capabilities.
  - Answer the prospect's actual questions.
  - Keep it short.
- **Sending:** `sendReply(actor, replyId, { subject, body, humanConfirmedClaims: true })` calls `sendOneOffEmail` in the same thread. A sent response closes the SLA timer.

**Evals:** at least 10 cases. Include a price question where the budget is below the profile minimum (the draft should be honest and suggest a smaller package, never discount on its own authority), and a question about a service FUTUREUNI doesn't offer.

---

## Step 6: Assisted-channel replies

`logAssistedReply(actor, { leadId, channel: "WHATSAPP" | "LINKEDIN" | "PHONE", text, receivedAt })`:

- stores a `Reply` with the channel
- runs the same classification and actions
- WhatsApp replies are **never** read automatically; a human pastes them

A reply to a WhatsApp message suggests the response draft for WhatsApp as well, at 600 characters or fewer.

---

## Step 7: Inbox services (for Phase 16)

- `listThreads({ serviceLine, market?, classification?, unread?, ownerId?, needsHumanReview?, slaStatus?, unmatched?, cursor })`: grouped by lead, with the latest reply summary, class badge, SLA status and owner
- `getThread(leadId)`: every message and reply in order, the classifications, the drafts, and the actions taken
- `markRead` and `markUnread`
- `getUnmatchedReplies()` and `linkReply(...)`
- `getInboxCounts(userId)`: unread and actionable, by line, for the platform home and the navigation badges
- Every mutation checks permission (line-scoped) and is audited.

---

## Step 8: Exports and jobs

- **Jobs:**
  - `acquisition.inbox.poll`
  - `acquisition.inbox.process` (per reply)
  - `acquisition.inbox.sla-check` (every 15 minutes)
  - `acquisition.inbox.nurture-reminders` (daily)
- **Exports** (Wave 3 guide, B3):
  - `inboxJobs`
  - `inboxSchedules`
  - `inboxSettings`: SLA hours, confidence threshold, default nurture days, unsubscribe scope (shared with Phase 12; reference the same key)
  - `inboxNotifications`: `reply.interested`, `reply.needs-action`, `reply.sla-warning`, `reply.sla-breached`, `nurture.follow-up-due`
  - the AI tasks

---

## Step 9: Tests

- **Unit tests:**
  - quoted-text and signature stripping (Gmail, Outlook, Apple Mail and mobile formats)
  - the matching order
  - the deterministic rules (DSN parsing, auto-submitted headers, unsubscribe phrases)
  - follow-up date resolution (relative phrases, recipient timezone, past dates rolled forward)
  - SLA business-hours maths
  - round-robin weighting
- **Integration tests** (test database, mock source, inline runner, controlled clock):
  - every class runs the correct action and transition
  - re-polling doesn't duplicate
  - unmatched replies can be linked
  - reclassifying to `UNSUBSCRIBE` suppresses immediately
  - an out-of-office pauses and resumes
  - a referral creates a verified contact and a proposed draft
  - SLA warnings and breaches notify the right people
  - an assisted reply logs and classifies
  - `sendReply` goes through `sendOneOffEmail`
  - permissions (a Video Editing lead can't read Web Development threads unless the matrix allows it)
- **Evals** for classification (with `UNSUBSCRIBE` recall) and draft replies.

---

## Constraints

- **Replies always stop automatic sending.** Unsubscribe requests are honoured immediately and are never answered with marketing.
- **Never read WhatsApp or LinkedIn automatically.**
- **Don't edit the manifest, schema, contracts or core transitions.** Raise requests.
- **No UI.**
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] Ingestion works through the ADR's method, IMAP and mock, with polling, push if available, normalisation, quote stripping, matching, idempotency and unmatched linking.
- [ ] Classification works: deterministic rules, then Claude with extraction, and safety bias towards stopping. `UNSUBSCRIBE` recall is 100% on the eval suite.
- [ ] The action for every class is implemented with the correct transitions and seams. Human reclassification works.
- [ ] Routing, SLAs and escalations work.
- [ ] Drafted responses and sending through the outreach path work. Assisted replies can be logged.
- [ ] Inbox services and counts exist.
- [ ] `phases/13/REQUESTS.md` lists the exports and any requests (for example the mailbox cursor storage).
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/13/SUMMARY.md` is written.
