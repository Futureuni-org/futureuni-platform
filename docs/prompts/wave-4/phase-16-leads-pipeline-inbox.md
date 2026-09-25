# Phase 16: Leads, Lead Detail, Pipeline Board and Inbox

> **How to run this phase**
> 1. Wave 3 must be merged and integrated, and Part A of `wave-4-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 16 leads-pipeline-inbox`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-16-leads-pipeline-inbox.md and execute it. Plan first."**
>
> Wave 4. Runs in parallel with Phases 15, 17 and 18. Depends on Waves 0–3.

---

## Your role and the goal of this phase

You build the screens where the team **works a lead from first evidence to signed client**:

1. **The leads list:** every lead for a line, filterable, with saved views and bulk actions.
2. **Lead detail:** the complete picture of one prospect:
   - the brief and score
   - contacts and the contactability verdict
   - the **full audit evidence** with screenshots
   - the conversation
   - meetings with pre-call briefs
   - proposals with a live quote builder
   - activity and notes
   - every stage action
3. **The pipeline board:** drag-and-drop stages with totals, required-information dialogs, and overdue and stale highlights.
4. **The inbox:** classified replies with SLAs, conversation view, AI-drafted responses, reclassification, logging of WhatsApp replies, and linking of unmatched replies.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (invariants 2, 3, 5, 7 and 11; the output rules for money and dates) and `docs/decisions.md`
2. `docs/specs/module-acquisition.md`: the lead lifecycle, pipeline, inbox, meetings, proposals and won/lost sections, with their screen states
3. **`docs/prompts/wave-4-prep-and-merge.md`:** the route map, `SEAM-LINE-CONTEXT` (you're a consumer), and **the UI quality bar (B3), in full**
4. `phases/04/SUMMARY.md` ("How to build a screen") and the `/dev/ui` gallery
5. The service READMEs:
   - `@/modules/acquisition/core`
   - `@/modules/acquisition/scoring` (`getLeadScore`, `rescoreLead`)
   - `@/modules/acquisition/crosssell`
   - `@/modules/acquisition/audits` (`getAuditsForLead`, `rerunAudit`, `dismissFinding`)
   - `@/modules/acquisition/enrichment` and `compliance` (contacts, contactability, `addSuppression`)
   - `@/modules/acquisition/outreach` (thread messages, `sendOneOffEmail`, enrolment status)
   - `@/modules/acquisition/inbox` (`listThreads`, `getThread`, `reclassify`, `sendReply`, `logAssistedReply`, `assignThread`, `snoozeThread`, `linkReply`, `getUnmatchedReplies`, `markRead`)
   - `@/modules/acquisition/pipeline` (`getPipeline`, `moveLead`, `setNextAction`, meetings, pre-call briefs, outcomes, proposals and pricing, `markWon`, `markLost`, handoff)
   - `@/platform/auth`, `@/platform/storage` (signed URLs)
6. `phases/*/SUMMARY.md` for every completed phase
7. The global skills **`saas-ui`** (in full), `saas-testing` and `saas-review`

---

## What you own

- `src/app/(platform)/acquisition/[line]/leads/**`, `[line]/pipeline/**` and `[line]/inbox/**`
- `src/modules/acquisition/ui/leads/**`, `ui/pipeline/**` and `ui/inbox/**`
- `phases/16/**`

Consume `SEAM-LINE-CONTEXT` through `ui/leads/_seams.ts` (shared by your three areas).

---

## Step 1: Leads list (`[line]/leads/`)

- **PageHeader:** a title, the line's lead count, and actions (**Add lead**, which links to Phase 15's manual add route; **Export CSV**, if permitted).
- **FilterBar:**
  - search (company, contact, domain)
  - status (grouped: new → audited, in review, contacted, replied, pipeline, nurture, closed)
  - market, country, score range, owner, source adapter, signal type, flags (needs review, compliance review, cross-sell), and created or updated date
  - all in the URL
  - **saved views** per user, plus built-in views: "My leads", "Hot (replied, last 7 days)", "Stuck in enrichment", "Nurture due this week"
- **DataTable columns:**
  - company (name plus city/country)
  - market badge, status badge
  - score (meter)
  - strongest finding (a claim excerpt)
  - owner (avatar)
  - last activity (relative)
  - next action (with overdue highlight)
  - source
- Row click opens the lead detail.
- Card rendering on mobile. Cursor pagination.
- **Bulk actions,** permission-aware, with confirmations: assign owner, snooze, re-score, re-audit, disqualify (with a reason), add to suppression (admin, with a reason).

---

## Step 2: Lead detail (`[line]/leads/[leadId]`)

Use Phase 4's `DetailLayout`.

1. **Header:**
   - the company name, website or social links, city or country, market badge, **status badge**, score meter, owner (reassignable) and line
   - a cross-sell chip if the company is in a group, linking to the other line's lead
   - **Primary actions change with the status.** For example:

     | Status | Primary actions |
     |---|---|
     | `SCORED` | "Draft outreach" (opens the review queue for this lead) |
     | `REPLIED` | "Book meeting" (booking link or manual meeting), "Create proposal" |
     | `PROPOSAL_SENT` | "Mark won" / "Mark lost" |

   - Secondary actions in a menu: re-score, re-audit, snooze, move to nurture, disqualify, suppress (admin), and data request (admin, links to `/admin/data-requests`).
2. **Side rail:**
   - key facts: legal form, size, industry, first source, created date
   - **contacts:** name, role, email with a verification status badge, phone with a WhatsApp status (confirmed or likely), LinkedIn company page, the primary contact marked, and "set as primary"
   - **the contactability panel:** each channel with its status and a plain-language reason
   - enrolment status (active, paused until X, stopped with the reason)
   - next action (inline edit)
3. **Tabs,** kept in the URL through `?tab=`:
   - **Overview:**
     - the brief
     - the top findings as evidence chips
     - score reasons with points
     - Claude's borderline review, if any
     - the signals timeline (source, evidence, date, link)
   - **Evidence:** every audit, grouped by agent. For each: status, captured date, cost, and a re-run action. Each finding shows:
     - severity, claim, method badge (measured, observed, AI-judged), confidence
     - structured evidence: metrics as small mono tables (for example LCP 7.2s, CLS 0.31, score 34)
     - source link and screenshot artifacts in a **gallery with a lightbox**, comparing mobile and desktop side by side
     - "Dismiss finding" with a reason, showing a warning that dismissed findings can't be cited
     - "Not assessed" checks shown honestly, with the reason
   - **Conversation:** the full thread (outbound messages with their cited findings, replies with class badges), plus a composer to send a one-off email through `sendOneOffEmail`, with human confirmation.
   - **Meetings:**
     - upcoming and past meetings
     - the **pre-call brief view:** summary, what they care about, likely needs, suggested questions, suggested package, price range, risks and cited findings. It's printable, and has "Regenerate brief".
     - the outcome form (held, no-show, rescheduled; notes; paste a transcript) and the generated meeting summary with next steps
   - **Proposals:**
     - the version list with statuses
     - **Quote builder:**
       - pick packages from the line's pricing for the lead's market
       - add custom line items
       - a discount (percentage or amount)
       - `validUntil`
       - **live totals computed by the server-side deterministic pricing service**, never by client maths
       - shows when manager approval is needed and why
     - generate the proposal, which shows the PDF preview (signed URL) and the section text
     - approve (if permitted) or request approval
     - send (contact picker, covering message, human confirmation)
     - mark accepted or declined
     - version diff
   - **Activity:** `LeadEvents` and relevant audit entries as a timeline (who, what, when, from → to), filterable.
   - **Notes:** add a note (markdown-lite, with mentions of teammates that trigger a notification if the service supports it; otherwise plain notes).
4. **Won / lost dialogs:**
   - **Won:** value (a currency input, with the currency defaulting from the market), services, linked proposal, start date and notes.
   - **Lost:** a reason (the fixed list), competitor, note and an optional re-engagement date.
   - On won, show the handoff record with the suggested assignee per service, changeable by a manager, plus an export link.

---

## Step 3: Pipeline board (`[line]/pipeline/`)

- Use Phase 4's `KanbanBoard`.
- **Columns:** Awaiting reply (collapsed by default), Conversation, Meeting booked, Proposal sent, Won, Lost, and a separate **Nurture** lane (toggle).
- **Column headers:** the count and the **value per currency**, shown separately (for example "₦4.2m · $6,800 · £2,100"), never summed.
- **Cards:**
  - company, contact, owner avatar, days in stage, estimated value (`Money`), next action with an overdue highlight, stale badge, market badge
  - a quick menu: set next action, open, move
- **Drag and drop,** fully keyboard-accessible with screen-reader announcements, and optimistic with rollback:
  - dropping into **Won** or **Lost** opens the matching dialog (Step 2.4); cancelling the dialog cancels the move
  - dropping into **Meeting booked** asks for a manual meeting date, or offers "Send booking link" instead
  - dropping into **Proposal sent** is only allowed if a sent proposal exists; otherwise it offers "Create proposal"
  - invalid moves (not in the allowed transitions) snap back with an explanation
- **Filters,** in the URL: market, owner, value range, overdue only, stale only.
- **Header totals:** open pipeline value per currency, and won this month.
- Card click opens the lead detail in a **Sheet**, keeping the board in view, with "Open full page".
- **Mobile:** horizontal columns with snap, and a column switcher.

---

## Step 4: Inbox (`[line]/inbox/`)

- **Layout:**
  - **Desktop:** three panes. The thread list, the conversation, and a context rail (lead summary, contactability, extracted data, actions taken).
  - **Mobile:** drill down from the list to the conversation, with the context in a Sheet.
  - The selected thread lives in `?thread=<leadId>`.
- **Thread list:**
  - Grouped by lead, showing the latest reply summary (one line from the classifier), class badge, SLA indicator (on track, warning, breached, with the remaining time), unread dot, owner avatar and market badge.
  - Filters: class, unread, needs review, SLA status, owner, market, and an **Unmatched** tab.
  - Keyboard: `J`/`K` to move, `Enter` to open, `U` to mark unread, `E` to assign.
- **Conversation view:**
  - Use Phase 4's `ConversationThread`: outbound messages (with channel icons and cited findings on hover) and replies (with the class badge and confidence).
  - **Quoted history collapsed.**
  - Extracted data as chips: follow-up date, referral (name and email, with its verification status), objection summary, questions.
  - An "Actions taken" log: sequence stopped, paused until X, suppressed, referral draft proposed. Plain language.
- **Composer:**
  - loads the **AI draft** (`inbox-draft-reply`) for actionable classes, with a regenerate control and quick actions
  - flags "Needs pricing approval" when set
  - human confirmation is required
  - Send calls `sendReply`
  - for WhatsApp threads, it offers "Copy for WhatsApp" at 600 characters or fewer
- **Reclassify:**
  - a dropdown with the classes
  - changing to `UNSUBSCRIBE` shows the consequence ("This will suppress this contact and stop all outreach to the company") and requires confirmation
  - changing away from `UNSUBSCRIBE` explains that the suppression stays and must be removed by an admin
- **Other actions:** assign, snooze, "Log a WhatsApp/LinkedIn/phone reply" (a paste dialog, then classified and actioned with a result toast), and "Book meeting" (inserts the booking link into the composer).
- **Unmatched tab:** a list of unmatched replies with search to link each one to a lead (`linkReply`).
- **Polling:** thread-list counts refresh every 30s; the open thread refreshes after actions.

---

## Step 5: Tests and quality

Meet **every item in the Wave 4 UI quality bar (B3)**. In addition:

- **Component tests:**
  - the lead-detail status-driven actions
  - the findings gallery and lightbox keyboard navigation
  - quote-builder totals come from the server and show the approval notice
  - Kanban drop rules (Won and Lost dialogs, invalid move snap-back)
  - the reclassify-to-`UNSUBSCRIBE` confirmation
  - the composer's human-confirmation gating
- **Playwright,** in `tests/e2e/phase-16/`, desktop and mobile:
  - filter leads and save a view
  - bulk-assign
  - open a lead and view the evidence and screenshots
  - dismiss a finding
  - send a one-off email
  - log a manual meeting and see the pre-call brief
  - build a proposal with a discount above the threshold (approval required), approve as manager, send
  - drag to Won with the dialog and see the handoff
  - inbox: open an `INTERESTED` thread, send the AI draft, reclassify another reply to `UNSUBSCRIBE`, log a WhatsApp reply, link an unmatched reply
  - permission checks per role
- **Playwright MCP visual review** of every screen (B3.14).

---

## Constraints

- **Money totals and prices come only from the services.** No client-side money maths.
- **Only use the existing services.** Raise gaps in `REQUESTS.md`.
- **No new generic primitives** (B3.1).
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The leads list works, with filters, saved views, bulk actions and mobile cards.
- [ ] Lead detail works: header with status-driven actions, side rail with contacts and contactability, and the Overview, Evidence (gallery and dismissal), Conversation, Meetings (pre-call brief and outcome), Proposals (server-priced quote builder, approval, PDF, send), Activity and Notes tabs, plus the won/lost dialogs and handoff.
- [ ] The pipeline board works: per-currency totals, accessible drag with required dialogs, rules, filters and the Sheet detail.
- [ ] The inbox works: three panes, SLA indicators, extracted data, the AI draft composer, reclassification with consequences, assisted reply logging and unmatched linking.
- [ ] The Wave 4 UI quality bar is met, the tests pass, and axe is clean.
- [ ] `pnpm check` and `pnpm test:e2e` pass.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/16/SUMMARY.md` (including the visual review notes) and `phases/16/REQUESTS.md` are written.
