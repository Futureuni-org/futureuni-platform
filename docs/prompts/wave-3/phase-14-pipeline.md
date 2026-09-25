# Phase 14: Pipeline, Meetings, Proposals and Won/Lost

> **How to run this phase**
> 1. Wave 2 must be merged and integrated, and Part A of `wave-3-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 14 pipeline`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-14-pipeline.md and execute it. Plan first."**
>
> Wave 3. Runs in parallel with Phases 11, 12 and 13. Depends on Waves 0–2.

---

## Your role and the goal of this phase

You take a warm conversation to a **signed client and a clean handoff to the delivery team**:

1. **Pipeline:** stages from first reply to won or lost, per service line and market, with values and totals.
2. **Meetings:**
   - booking links per owner
   - calendar integration and webhooks
   - reminders
   - a **pre-call brief** generated before every meeting
   - a meeting summary afterwards
3. **Proposals and quotes:**
   - built from the profile's packages and pricing rules
   - **priced deterministically in code, never by the model**
   - written up by Claude
   - rendered as a branded PDF
   - approved when discounts exceed a limit
   - sent through the outreach thread
   - tracked to accepted or declined
4. **Won and lost:**
   - won records the deal value and creates a **handoff record** that assigns the work by capacity
   - lost records a structured reason and an optional re-engagement date

**No UI.** Phase 16 builds the pipeline board and lead detail screens, and Phase 17 the revenue analytics, on your services.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (invariants 11 and 12; the output/document rules for proposals and briefs) and `docs/decisions.md` (the calendar provider, and the proposal PDF approach if recorded)
2. `docs/specs/module-acquisition.md`: the pipeline, meetings, proposals, won/lost and handoff sections
3. `docs/contracts/events.md`
4. **`docs/prompts/wave-3-prep-and-merge.md`:** you provide `SEAM-BOOKING-LINK`. You consume `SEAM-LEAD-BRIEF`, `SEAM-STOP-SEQUENCE` and `SEAM-SEND-ONEOFF`. You own the Phase 14 transitions in B1.
5. The READMEs of:
   - `@/modules/acquisition/profiles` (`getPricingForLine`, the services catalogue reference, portfolio)
   - `@/modules/acquisition/audits`
   - `@/modules/acquisition/core`
   - `@/platform/team` (`recalculateLoad`, capacity)
   - `@/platform/ai`, `@/platform/storage`, `@/platform/jobs`, `@/platform/notifications`, `@/platform/settings`, `@/platform/audit-log`, `@/platform/credentials`, `@/platform/auth`
6. `phases/*/SUMMARY.md` for every completed phase
7. The global skills `saas-api` (webhooks), `saas-ai`, `saas-data` (money), `saas-ui` (only for the PDF's brand treatment), `saas-testing` and `saas-review`

Verify the current docs for the chosen calendar provider (Cal.com: event types, booking metadata, webhooks and signature verification; or the Google Calendar API: events, Meet links and push notifications) and for your PDF library (for example `@react-pdf/renderer`). Record the source URLs.

---

## What you own

- `src/modules/acquisition/pipeline/**`
- `runtime-skills/acquisition/pipeline-*/**`
- `evals/acquisition/pipeline-*/**`
- `src/app/api/webhooks/calendar/**`
- `phases/14/**`

---

## Step 1: Pipeline (`pipeline/board/`)

- **Board columns** for a line, in order:
  1. Conversation (`REPLIED`)
  2. Meeting booked
  3. Proposal sent
  4. Won
  5. Lost
  6. Nurture (a separate lane)

  `CONTACTED` leads appear in a collapsed "Awaiting reply" column for context.
- **`getPipeline({ serviceLine, market?, ownerId?, from?, to? })`:**
  - cards with the company, contact, owner, days in stage, next action, and estimated value (from the latest proposal, or the profile's typical package value)
  - column totals: count, and value per currency with **no conversion**; show NGN and USD/GBP separately
- **`moveLead(actor, leadId, to, payload)`:** validates the required payload per target:
  - `LOST` requires a reason
  - `WON` requires a value, currency and services
  - `MEETING_BOOKED` without a calendar booking requires a date and time (a manual meeting)

  Then calls `transitionLead`, audits, and emits events. Moving to `MEETING_BOOKED`, `WON` or `LOST` also calls `stopEnrollments({ leadId }, reason)`.
- **Next actions:** `setNextAction(actor, leadId, { at, note })`, plus an overdue list for the platform home (`getOverdueNextActions(userId)`).
- **Stale detection:** a daily job flags leads with no activity in N days (per stage, from settings), and notifies the owners.

---

## Step 2: Meetings (`pipeline/meetings/`)

1. **The `CalendarProvider` adapter,** with implementations:
   - the ADR's choice (Cal.com or Google Calendar)
   - `mock`
   - Credentials come from the vault.
2. **Booking links:** `getBookingLink(leadId, ownerId?)` implements `SEAM-BOOKING-LINK` exactly. It returns the owner's booking URL with the lead reference embedded so the webhook can match it back: Cal.com metadata or a prefill parameter, or a signed token.
3. **The webhook** at `src/app/api/webhooks/calendar/[provider]`:
   - verifies the signature and dedupes by event ID
   - on **created:** creates the `Meeting` (start and end in UTC, attendee, location or video link, owner), transitions to `MEETING_BOOKED`, `stopEnrollments({ leadId }, "MEETING_BOOKED")`, and notifies the owner (`meeting.booked`)
   - on **rescheduled or cancelled:** updates the meeting and notifies the owner. A cancellation without a new booking returns the lead to `REPLIED`, with a next action to follow up.
   - an unmatched booking, for example someone booking without a lead reference, is matched by attendee email to a contact, or else parked for manual linking
4. **Manual meetings:** `createMeeting(actor, leadId, { startsAt, endsAt, location, notes })`, for bookings arranged over WhatsApp or by phone. Very common in Nigeria.
5. **Reminders:** 24 hours and 1 hour before, to the owner (`meeting.reminder`). Optionally a reminder to the prospect **only** through the calendar provider's own reminder feature, never from the outreach mailbox.
6. **The pre-call brief:** job `acquisition.pipeline.precall-brief`, 2 hours before each meeting (and on demand). It uses the AI task in Step 4 and is stored on the meeting. The owner is notified with a link.
7. **After the meeting:**
   - `recordMeetingOutcome(actor, meetingId, { outcome: HELD | NO_SHOW | RESCHEDULED, notes, transcript? })`
   - if notes or a pasted transcript exist, the meeting-summary task produces the summary, needs, budget signals, decision makers, next steps, and a recommended package
   - a no-show sets a next action for a follow-up

---

## Step 3: Proposals and quotes (`pipeline/proposals/`)

1. **Deterministic pricing** (`pricing.ts`): a pure function.
   - **Input:** the selected packages (from `getPricingForLine(line, market)`), custom line items (description, quantity, unit price), a discount (percentage or amount), tax settings (for example Nigerian VAT, if FUTUREUNI charges it; a setting, off by default), and the currency.
   - **Output:** line totals, subtotal, discount, tax and total, all as **integer minor units**. Rounding rules are documented.
   - **No floating-point money anywhere** (invariant 11).
   - The currency must match the market: NGN for Nigeria, and USD, GBP or EUR for international, per the profile.
2. **Build a proposal:** `createProposal(actor, leadId, { packages, lineItems, discount, validUntil, notes })`:
   - computes the price
   - runs the proposal-writing task (Step 4), which receives the **already-computed** figures and may only restate them
   - stores a `Proposal` version (status `DRAFT`)
   - `reviseProposal` creates a new version, and `diffProposalVersions` compares versions
3. **Approval:**
   - A discount above a threshold (a setting, default 10%), or a total outside the profile's package ranges, requires `MANAGER` or `ADMIN` approval: `approveProposal(actor, proposalId)`.
   - Otherwise the owner can approve.
   - Every approval is audited.
4. **PDF:**
   - Rendered with the chosen PDF library.
   - **Branded:** FUTUREUNI logo, the palette (deep navy, violet accent, lavender panels), and the typefaces chosen in Phase 0.
   - Follows the project-rules output rules: headings, currency formatting (₦ / $ / £ / €, thousands separators), dates.
   - **Sections:**
     1. cover
     2. understanding of the client's situation (citing findings in plain language)
     3. proposed solution
     4. scope and deliverables
     5. timeline
     6. investment table
     7. why FUTUREUNI (with non-placeholder portfolio items only)
     8. terms summary and validity
     9. next steps and acceptance
   - Stored in storage (purpose `proposal-pdf`, private) with a `FileObject`.
5. **Sending:** `sendProposal(actor, proposalId, { contactId, message })` calls `sendOneOffEmail` in the thread with the PDF attached and `humanConfirmedClaims: true`, then transitions to `PROPOSAL_SENT`.
6. **Response:**
   - `markProposalAccepted` (then leads to won, below)
   - `markProposalDeclined(actor, proposalId, reason)`
   - `expireProposals` (a daily job past `validUntil`), which sets a next action to follow up

---

## Step 4: AI tasks (`runtime-skills/acquisition/pipeline-*`)

Register these with references from `selectAcquisitionReferences`:

- **`acquisition.pipeline-precall-brief`** (balanced tier):
  - **Input:** company facts, the lead brief, findings with IDs, the conversation so far (messages and replies), the profile's packages and ranges, and the portfolio.
  - **Output:** `{ summary, whatTheyCareAbout[], likelyNeeds[], suggestedQuestions[] /* 5–8 */, suggestedPackage: { packageId, why }, priceRangeToDiscuss: { minMinor, maxMinor, currency }, risks[], citedFindingIds[] }`
  - Validated with `assertClaimsCited`.
  - The price range **must come from the profile input**.
- **`acquisition.pipeline-meeting-summary`** (balanced tier):
  - **Input:** meeting notes or a transcript (a data block) plus the context.
  - **Output:** `{ summary, needs[], budgetSignals[], decisionMakers[], objections[], nextSteps: Array<{ action; owner; due }>, recommendedPackageIds[] }`
  - It extracts only what the notes say.
- **`acquisition.pipeline-proposal-draft`** (deep or balanced tier):
  - **Input:** the brief, the meeting summary, findings, the selected packages with **computed prices**, the timeline, the catalogue entries, and non-placeholder portfolio items.
  - **Output:** the prose for each PDF section.
  - **Validation:** every number in the output must equal a supplied figure. A deterministic check parses the currency amounts and dates from the text and compares them against the input; a mismatch triggers one repair attempt, then an error. Claims about the client must cite findings or meeting-summary facts.

**Evals:** at least 8 cases per task. Include:

- a proposal case where the model is tempted to "round" a price
- a meeting transcript with an injection attempt
- a Nigerian client (₦ formatting)
- a UK client (£)
- a case that must mention a timeline constraint the client stated

---

## Step 5: Won, lost and handoff (`pipeline/deals/`)

- **`markWon(actor, leadId, { valueMinor, currency, services[], proposalId?, startDate, notes })`:**
  - creates the `Deal`
  - transitions to `WON`
  - `stopEnrollments({ companyId }, "WON")`
  - **creates the handoff** (below)
  - notifies (`deal.won`) the owner, the line lead and the managers
  - emits `deal.won`, which a future Projects module will subscribe to
- **Handoff record:**
  - **Content:**
    - the client company and contacts
    - the services sold
    - scope and deliverables (from the proposal)
    - agreed timeline and start date
    - value and payment notes
    - key findings and context
    - the meeting summaries
    - files (the proposal PDF)
  - **Assignment:** a suggested delivery owner per service, chosen by line capacity (`@/platform/team`), which a manager can override: `assignHandoff(actor, handoffId, { serviceLine, userId })`. After assignment, call `recalculateLoad` for the assignee, so capacity and throttling (Phase 11) react.
  - **Export:** `exportHandoff(handoffId)` renders a branded PDF and a markdown version for the delivery team.
  - **Status:** `NEW → ACKNOWLEDGED` by the assignee.
- **`markLost(actor, leadId, { reason, competitor?, note, reengageAt? })`:**
  - reasons: `PRICE`, `TIMING`, `NO_RESPONSE`, `CHOSE_COMPETITOR`, `IN_HOUSE`, `NOT_A_FIT`, `SCOPE_CHANGED`, `OTHER`
  - transitions to `LOST` and stops enrolments
  - if `reengageAt` is set, a daily job moves the lead to `NURTURE` on that date and notifies the owner
- **Re-engagement:** when a `NURTURE` lead replies again, `NURTURE → REPLIED` happens through the inbox. Provide `reengageLead(actor, leadId)` for manual re-engagement.

---

## Step 6: Revenue data for analytics

Provide these services for Phase 17:

- `getRevenueSummary({ serviceLine?, market?, from, to })`: won count, revenue per currency, average deal size, time to close (first contact to won, median and p75), and the proposal acceptance rate
- `getLossReasons(...)`
- `getMeetingStats(...)`: booked, held, no-show rate
- `getStageConversion(...)`: stage-to-stage conversion and time in stage

---

## Step 7: Exports and jobs

- **Jobs:**
  - `acquisition.pipeline.precall-brief`
  - `acquisition.pipeline.meeting-reminders`
  - `acquisition.pipeline.stale-check`
  - `acquisition.pipeline.proposal-expiry`
  - `acquisition.pipeline.reengage`
- **Exports** (Wave 3 guide, B3):
  - `pipelineJobs`
  - `pipelineSchedules`
  - `pipelineSettings`: stale days per stage, discount approval threshold, tax settings, reminder offsets, default booking URL per owner
  - `pipelineNotifications`: `meeting.booked`, `meeting.reminder`, `precall.ready`, `proposal.approval-needed`, `proposal.expired`, `deal.won`, `deal.lost`, `handoff.assigned`, `lead.stale`
  - the AI tasks
- Every mutation checks permission (line-scoped; approvals per the matrix) and is audited.

---

## Step 8: Tests

- **Unit tests:**
  - pricing maths (packages, line items, percentage and fixed discounts, tax on and off, rounding, currency/market mismatch rejected)
  - the number-consistency validator for proposal prose
  - board column mapping and totals per currency
  - reminder scheduling across timezones
  - the booking-link token round trip
- **Integration tests** (test database, mocks, inline runner, controlled clock):
  - a calendar webhook creates a meeting, moves to `MEETING_BOOKED`, stops the sequence and notifies
  - rescheduling and cancellation
  - a manual meeting
  - the pre-call brief is generated 2 hours before
  - a proposal is created, needs approval above the threshold, is approved, rendered as a PDF, sent through `sendOneOffEmail`, and the lead becomes `PROPOSAL_SENT`
  - accepted leads to won, then a deal, then a handoff with a capacity-based assignee, and load is recalculated
  - lost with a re-engagement date moves to `NURTURE` on that date
  - the stale-lead check
  - permissions on proposal approval
- **Evals** for the three AI tasks.
- **A PDF check:** render a sample Nigerian and a sample UK proposal, open them, and **look at them** to confirm they're correct and on-brand. Record what you checked.

---

## Constraints

- **Prices are computed in code only.** The model restates figures and never creates them.
- **Don't edit the manifest, schema, contracts or core transitions.** Raise requests.
- **No internal UI.** The PDFs are your only visual output.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] Pipeline services work: board, totals per currency, moves with required payloads, next actions, stale detection.
- [ ] Meetings work: the calendar adapter (ADR choice and mock), booking links that match `SEAM-BOOKING-LINK`, the webhook, manual meetings, reminders, the pre-call brief and the meeting outcome and summary.
- [ ] Proposals work: deterministic pricing, the drafting task with the number-consistency check, approval rules, a branded PDF, sending through the thread, and accept/decline/expiry.
- [ ] Won, lost and handoff work, with capacity-based assignment and re-engagement.
- [ ] Revenue data services exist.
- [ ] `phases/14/REQUESTS.md` lists the exports and any requests.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/14/SUMMARY.md` is written, including rendered sample proposal PDFs for Nigeria and the UK saved under `phases/14/samples/`.
