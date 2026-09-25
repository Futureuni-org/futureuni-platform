# Phase 12: Outreach Engine

> **How to run this phase**
> 1. Wave 2 must be merged and integrated, and Part A of `wave-3-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 12 outreach`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-12-outreach.md and execute it. Plan first."**
>
> Wave 3. Runs in parallel with Phases 11, 13 and 14. Depends on Waves 0–2.

---

## Your role and the goal of this phase

You build **how FUTUREUNI reaches out: truthfully, compliantly, and in a way that protects its domains**. This phase carries the most risk in the platform:

- a wrong claim embarrasses the company
- a missed unsubscribe breaks the law
- a careless sending pattern gets the domains blacklisted

So correctness and safety come before cleverness.

**You deliver:**

1. **Drafting.** Claude writes each message from the lead's findings, the profile's pitch angle and portfolio, the market playbook, and the sequence step's purpose. **Every claim cites a finding.**
2. **The approval queue.** Humans approve, edit, reject, regenerate or snooze. Auto-send is optional, per line.
3. **The sequence engine.** Multi-step sequences per line and market. Enrolment, timed steps, stop and pause rules.
4. **Email sending.** Dedicated outreach mailboxes on separate domains, warm-up ramps, daily caps, rotation, send windows in the recipient's timezone, threading, and bounce handling.
5. **Assisted channels:**
   - a pre-filled **"Send on WhatsApp"** link
   - a LinkedIn "copy and open"
   - call tasks

   A human always does the final send.
6. **Unsubscribe and compliance:**
   - a one-click unsubscribe (RFC 8058) plus an unsubscribe page
   - the postal address in every email
   - `assertEmailAllowed` and `assertNotSuppressed` in the **same code path** as every send
7. **Mailbox and domain management services:** DNS checks, health, and auto-pause.

**No UI** except the public unsubscribe page. Phase 15 builds the review queue screen and Phase 18 the mailbox settings, both on your services.

---

## Step 0: Read first

1. `CLAUDE.md`, and `.claude/project-rules.md`, especially **invariants 2, 3, 4, 5, 6, 7, 8 and 9** (you enforce most of them), plus the bans
2. `docs/decisions.md`: **the cold-outreach sending ADR** (Google Workspace via the Gmail API or SMTP, Microsoft 365, or a sending platform)
3. `docs/specs/module-acquisition.md`: the outreach, sequences, approval modes and review queue sections
4. `docs/contracts/outreach-channel.md` and `src/contracts/outreach-channel.ts`: implement exactly
5. **`docs/prompts/wave-3-prep-and-merge.md`:** you provide `SEAM-STOP-SEQUENCE`, `SEAM-PAUSE-SEQUENCE`, `SEAM-PROPOSE-ENROLLMENT`, `SEAM-SEND-ONEOFF`, `SEAM-RECORD-BOUNCE` and `SEAM-MAILBOXES`. You consume `SEAM-LEAD-BRIEF`, `SEAM-THROTTLE`, `SEAM-CROSSSELL` and `SEAM-BOOKING-LINK`. You own the Phase 12 transitions in B1.
6. The READMEs of:
   - `@/modules/acquisition/profiles` (`resolvePitchAngle`, `resolvePortfolio`, sequences)
   - `@/modules/acquisition/audits` (findings)
   - `@/modules/acquisition/compliance` (`assertEmailAllowed`, `getContactability`, `addSuppression`)
   - `@/modules/acquisition/core` (`assertNotSuppressed`, `transitionLead`)
   - `@/platform/ai` (`assertClaimsCited`, streaming)
   - `@/platform/credentials`, `@/platform/jobs`, `@/platform/settings`, `@/platform/events`, `@/platform/notifications`, `@/platform/audit-log`, `@/platform/storage`, `@/platform/auth`
7. `phases/*/SUMMARY.md` for every completed phase
8. The global skills `saas-api` (webhooks, idempotency), `saas-notify` (the deliverability checklist), `saas-ai`, `saas-data`, `saas-testing` and `saas-review`

Verify the current docs for:

- the chosen sender (the Gmail API send and threading headers, or the SMTP provider, or the Instantly/Smartlead API)
- RFC 8058 one-click unsubscribe with `List-Unsubscribe` and `List-Unsubscribe-Post`
- the current Gmail and Yahoo bulk-sender requirements (SPF, DKIM, DMARC, one-click unsubscribe, spam-rate threshold)
- the WhatsApp click-to-chat URL format

Record the source URLs.

---

## What you own

- `src/modules/acquisition/outreach/**`
- `runtime-skills/acquisition/outreach-*/**`
- `evals/acquisition/outreach-*/**`
- `src/app/(public)/**` (the unsubscribe page and a minimal public layout)
- `src/app/api/unsubscribe/**`
- `src/app/api/webhooks/outbound/**`
- `phases/12/**`

---

## Step 1: The drafting task (`runtime-skills/acquisition/outreach-draft`)

Register **`acquisition.outreach-draft`** (balanced tier). References come from `selectAcquisitionReferences` for the lead's line and market, plus the `futureuni-voice` shared skill.

**Input:**

- company facts
- the contact's name and role
- the line and market
- **the pitchable, non-dismissed findings, with IDs** (maximum 5, chosen by severity and `keyFindingIds` from `getLeadBrief`)
- the pitch angle (from `resolvePitchAngle`, preferring the brief's suggestion)
- portfolio items (from `resolvePortfolio`: non-placeholder only, maximum 2)
- the sequence step (index, purpose, channel)
- previous messages in this thread
- the cross-sell context
- the sender's name and title
- the booking link, for steps whose purpose calls for it

**Output:**

```ts
{ subject: string | null; body: string; citedFindingIds: string[]; angleId: string; portfolioIds: string[]; personalizationNotes: string }
```

**Hard constraints,** validated in code after generation. On failure, make one repair attempt, then mark the draft `NEEDS_EDIT`:

- `assertClaimsCited(body, inputFindingIds)`: every factual claim about the prospect is backed by a cited finding, and there are no invented facts.
- **Length and shape per channel:**
  - Email first touch: subject ≤ 60 characters, body ≤ 120 words; follow-ups ≤ 90 words.
  - WhatsApp: ≤ 600 characters, no links except one portfolio or booking link, and the first line identifies FUTUREUNI.
  - LinkedIn note: ≤ 300 characters.
- No banned phrases (from the voice skill). No false urgency. No fake "Re:" or "Fwd:". No claims about price unless they come from the profile.
- **The model never writes the footer.** The system appends the signature, the unsubscribe line and the postal address.
- Links are only the portfolio URLs and booking link from the input.

**Evals:** at least 10 cases per line across both markets. Include:

- a missing-fact trap
- a finding with an injection string in its evidence
- a UK prospect (no consent language)
- a Nigerian WhatsApp first touch, which must be short and warm with no slang
- a follow-up that must not repeat the first message
- a cross-sell case (one voice, the leading line first)
- a case with only low-severity findings, which should produce a gentle, value-first message

---

## Step 2: Messages and the approval queue (`outreach/review/`)

**Draft creation:** `createDraft(leadId, { stepIndex, actor })`:

- Honour `SEAM-CROSSSELL`: only the **leading** lead of a group gets drafts; held leads are skipped.
- Generate the draft and store the `Message` (status `DRAFT`, or `NEEDS_EDIT` on validation failure) with cited finding links (the relation table).
- Transition `SCORED → IN_REVIEW` for the first touch.

**Review services** (for Phase 15):

- `getReviewQueue({ serviceLine, market?, ownerId?, needsHumanReview?, complianceReview?, cursor })`: returns the company, the brief, findings with evidence and artifacts, the draft, the contactability verdict, and cross-sell info
- `approveMessage(actor, messageId)`:
  - **Checks:**
    - `can(acquisition.message.approve)`, and `canApprove` for members
    - `assertEmailAllowed` (for email)
    - `assertNotSuppressed`
    - the citations are still valid (none of the cited findings dismissed since)
    - the throttle allows a first touch (`SEAM-THROTTLE`)
  - **Then:**
    - set the status to `APPROVED`, with `approvedById` and `approvedAt`
    - transition `IN_REVIEW → APPROVED`
    - enrol in the sequence if this is the first touch
    - schedule the send
- `editMessage(actor, messageId, { subject, body })`:
  - Re-runs the automatic checks.
  - When a human changes wording, **new claims can't be verified automatically**, so approval of edited text requires `humanConfirmedClaims: true` ("I confirm every statement about this business is true"), which is recorded.
- `rejectMessage(actor, messageId, { reason, disqualifyLead? })`: the reason is a fixed list plus a note. Transitions `IN_REVIEW → SCORED` (to regenerate) or `→ DISQUALIFIED`. Reasons are stored for learning.
- `regenerateMessage(actor, messageId, { instruction? })`: an optional short human instruction ("make it warmer"), treated as a style hint, never as a source of facts.
- `snoozeLead(actor, leadId, until)`
- `streamDraftEdit(...)`: streaming AI assistance in the editor, through `streamTask`, so a reviewer can say "shorten this" live.

**Auto-send mode:** if the profile's `approvalMode` is `AUTO_SEND_ABOVE_SCORE`, drafts for leads at or above the threshold that pass **every** automatic check, and aren't flagged `needsHumanReview` or `complianceReview`, are approved by the system actor. Every auto-approval is audited.

---

## Step 3: The sequence engine (`outreach/sequences/`)

- **`enroll(tx, leadId, contactId)`:** creates the `Enrollment` from the profile's sequence for the lead's market. The database enforces invariant 9 (one active per company); handle the unique violation gracefully.
- **Tick job** `acquisition.outreach.tick`, scheduled every 5 minutes through the cron dispatcher. For each enrolment due (`nextRunAt <= now`, status `ACTIVE`):
  1. Re-check the stop conditions:
     - a reply exists
     - suppressed
     - bounced
     - a meeting was booked
     - the lead is no longer active
  2. Create the next step's draft. If the step needs review (the approval mode, or the channel is assisted), put it in the queue; otherwise auto-approve under the rules above.
  3. Schedule the next step, using the step delays in **business days** for the recipient's country.
- **Stop and pause** (provided seams, exact signatures):
  - `stopEnrollments(tx, scope, reason)`
  - `pauseEnrollment(tx, leadId, until, reason)`
  - Resuming a paused enrolment resumes at the same step.
  - Stopping by `companyId` stops every contact at that company (invariant 3).
- **`proposeEnrollment(actor, { leadId, contactId, reason })`** (provided seam): for referrals and re-engagement. Creates a draft for the new contact in the review queue, never an automatic send.
- Emit `outreach.enrolled`, `outreach.step.sent` and `outreach.enrollment.stopped`.

---

## Step 4: Email sending (`outreach/email/`)

1. **The `EmailSender` adapter,** per the outreach-channel contract, with implementations:
   - the ADR's choice (for example `gmail-api`)
   - `smtp`, as a generic fallback
   - `mock`, which records sends in memory and in the database with provider message IDs
   - Mailbox credentials (OAuth tokens or SMTP passwords) come only from `@/platform/credentials`.
2. **Mailboxes and domains** (`outreach/mailboxes/`):
   - **Services:**
     - `addMailbox`
     - `updateMailbox`
     - `pauseMailbox`
     - `listActiveMailboxes()` (provided seam)
     - `getMailboxHealth`
     - `checkDomainDns(domain)`: looks up SPF, DKIM (the selector from settings), DMARC and MX, and reports pass or fail with the fix needed
   - **Warm-up ramp** per mailbox: start at a low daily cap (default 5), increase daily to the target cap (default 30–40, from settings) over about 3–4 weeks. The current cap is computed from the warm-up start date.
   - **Health:**
     - track bounces, complaints (where the provider reports them) and reply rate per mailbox
     - **auto-pause** a mailbox when the hard-bounce rate over the last 100 sends exceeds a threshold (default 3%), and notify admins
   - **Rotation:** pick the mailbox with the most remaining capacity today, keeping each lead's thread on the same mailbox.
3. **The send path.** There's one function, and **every** automatic and one-off email goes through it:

   ```
   sendEmailMessage(messageId):
     load message+lead+contact+company
     assertNotSuppressed(email, phone, domain)        // invariant 2
     assertEmailAllowed(companyId, contactId)         // invariant 6
     check send window in recipient timezone          // invariant 8 → if outside, reschedule to next window start
     pick mailbox under cap                           // invariant 8 → if none, reschedule
     build MIME: subject, body + system footer (signature, unsubscribe line, postal address from settings)  // invariant 4
                 headers: List-Unsubscribe (mailto + https), List-Unsubscribe-Post: List-Unsubscribe=One-Click, Message-ID, In-Reply-To/References for follow-ups
     send via adapter (idempotency key = messageId)
     store providerMessageId, mailboxId, sentAt; transition APPROVED→CONTACTED on first touch; emit event
   ```

   **Recipient timezone:** from the company's country and city. Nigeria uses `Africa/Lagos`. For countries with several timezones, use the city, with a fallback to the capital. The window defaults to weekdays 09:00–17:00 local, plus a random offset in minutes, so sends don't all land on the hour.
4. **Tracking:**
   - **No open-tracking pixels and no link rewriting by default.** They hurt deliverability and privacy.
   - Metrics come from sends, replies (Phase 13), bounces and meetings.
   - Settings may turn click tracking on later. Document the trade-off.
5. **Bounces and outbound webhooks:**
   - `recordBounce(tx, { messageId?, providerMessageId?, email, kind, detail })` (provided seam): a hard bounce adds an `EMAIL` suppression through Phase 9's `addSuppression`, stops enrolments, and marks the contact's email invalid. A soft bounce is retried twice, then treated as hard.
   - `src/app/api/webhooks/outbound/[provider]` receives provider events (delivery, bounce, complaint) if the chosen sender offers them. Verify the signature, dedupe by event ID, and process asynchronously (saas-api webhooks).
6. **One-off email** (provided seam): `sendOneOffEmail(actor, input)`, used by the inbox (replies) and pipeline (proposals).
   - Same send path, same checks, the same mailbox as the thread.
   - Supports attachments from storage.
   - Requires `humanConfirmedClaims: true`.
   - Recorded as a `Message` with channel `EMAIL` and kind `ONE_OFF`.

---

## Step 5: Assisted channels (`outreach/assisted/`)

- **WhatsApp:** `prepareWhatsApp(messageId)`:
  - Returns `https://wa.me/<E164 digits>?text=<url-encoded body>` for the contact's WhatsApp number (confirmed, or `whatsappLikely`).
  - The message status becomes `PREPARED`.
  - `markAssistedSent(actor, messageId, { sentAt, note? })` records that the human sent it (status `SENT_ASSISTED`). For a first touch, this transitions the lead to `CONTACTED`.
  - **Never send through a WhatsApp API** (invariant 7).
  - The suppression and contactability checks run before the link is generated.
- **LinkedIn:** `prepareLinkedIn(messageId)` returns the text to copy plus the company page URL, and records the send the same way. It's never automated.
- **Call task:** `createCallTask(messageId)` gives a talking-points task for the owner, plus an outcome logging service.

---

## Step 6: Unsubscribe (`src/app/(public)/`, `src/app/api/unsubscribe/`)

- **Tokens:** signed (HMAC with a secret from env), carrying the contact ID, the message ID and the scope. They don't expire, but they can be revoked.
- **`POST /api/unsubscribe/[token]`:** the RFC 8058 one-click endpoint. It needs no session and no confirmation step:
  - verify the token
  - `addSuppression(EMAIL, reason UNSUBSCRIBE, source one-click)`
  - `stopEnrollments({ companyId }, "UNSUBSCRIBE")`, if the scope is the company, or `contactId` otherwise, following the default in settings
  - return 200
  - idempotent
- **`/u/[token]`:**
  - a minimal, on-brand public page that confirms the unsubscribe immediately on load, via POST from the page
  - an optional "tell us why" field
  - FUTUREUNI's name and contact
  - no login, no tracking
  - WCAG AA, and works at 375px
- **`mailto:` unsubscribe replies** are handled by Phase 13's classifier (`UNSUBSCRIBE`).

---

## Step 7: Exports, jobs and events

- **Jobs:**
  - `acquisition.outreach.tick`
  - `acquisition.outreach.send` (per message)
  - `acquisition.outreach.mailbox-health`
  - `acquisition.outreach.dns-check`
- **Exports** (Wave 3 guide, B3):
  - `outreachJobs`
  - `outreachSchedules`
  - `outreachSettings`: send window defaults, warm-up parameters, caps, bounce threshold, unsubscribe scope, click tracking (off), postal address (read from the platform setting)
  - `outreachNotifications` (`mailbox.paused`, `review.queue-waiting` digest)
  - the AI tasks
- **Every mutation** checks permission and is audited. **Every send** is idempotent by message ID.

---

## Step 8: Tests

- **Unit tests:**
  - the send-window calculation across timezones, business days and daylight saving
  - warm-up cap by day
  - mailbox rotation keeping thread affinity
  - MIME headers (`List-Unsubscribe`, `List-Unsubscribe-Post`, threading)
  - footer always present
  - token sign and verify, and tamper rejection
  - WhatsApp URL encoding (Nigerian numbers, emoji-free text, newlines)
  - draft validators (length per channel, links, banned phrases, citations)
- **Integration tests** (test database, mock sender, inline runner, controlled clock):
  - the full first touch: draft, review, approve, send in window, `CONTACTED`
  - sending outside the window reschedules
  - a suppressed contact is blocked at send time, even if suppressed after approval
  - a UK sole trader is blocked
  - editing without `humanConfirmedClaims` can't be approved
  - a dismissed finding invalidates approval
  - auto-send respects every flag
  - the tick sends the next step after the delay and stops on reply, bounce or meeting
  - a second active enrolment for the same company is rejected
  - a hard bounce suppresses and stops
  - mailbox auto-pause
  - the one-click unsubscribe works without a session and is idempotent
  - `sendOneOffEmail` threads into the existing conversation
  - the throttle blocks first touches when `PAUSED`
  - a held cross-sell lead gets no drafts
- **Evals** for the drafting task: precision on claims, and the channel rules.

---

## Constraints

- **Every send goes through the single send path.** No other code sends outreach email.
- **No WhatsApp API sending and no LinkedIn automation.** No open pixels by default.
- **Don't edit the manifest, schema, contracts or core transitions.** Raise requests.
- **No internal UI.** Only the public unsubscribe page.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The drafting task works with citation enforcement, channel rules, a system-owned footer and evals.
- [ ] Review services exist (queue, approve, edit with human confirmation, reject, regenerate, snooze, streaming edit), and auto-send works under strict rules.
- [ ] The sequence engine works: enrol, tick, business-day delays, stop, pause and resume, and propose-enrolment.
- [ ] The email send path enforces invariants 2, 4, 6 and 8, with mailboxes, warm-up, rotation, health and auto-pause, DNS checks, bounces, the outbound webhook, and one-off email.
- [ ] Assisted WhatsApp, LinkedIn and call tasks work, with human-confirmed sends.
- [ ] RFC 8058 one-click unsubscribe and the public page work without a session.
- [ ] Every provided seam matches the Wave 3 signatures exactly.
- [ ] `phases/12/REQUESTS.md` lists the exports and any requests.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings, with extra attention to compliance and deliverability.
- [ ] `phases/12/SUMMARY.md` is written, with a **"Before sending for real" checklist** for Phase 21: domains, DNS, warm-up and the Gmail/Yahoo requirements, with source links.
