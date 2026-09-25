# Phase 15: Module Shell, Search, Saved Searches and the Review Queue

> **How to run this phase**
> 1. Wave 3 must be merged and integrated, and Part A of `wave-4-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 15 module-shell`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-15-module-shell.md and execute it. Plan first."**
>
> Wave 4. Runs in parallel with Phases 16, 17 and 18. Depends on Waves 0–3.

---

## Your role and the goal of this phase

You build the **front door of Client Acquisition** and its **two most-used screens**:

1. **The module shell.** The service-line tabs (Web Development, UI/UX Design, Graphic Design, Video Editing) plus Overview, and each line's section navigation (Search, Review, Pipeline, Inbox, Analytics, Settings) with live count badges.
2. **Search.** The screen where someone types "restaurants in Lagos" and watches qualified businesses arrive:
   - the market toggle
   - sources
   - a cost estimate
   - live run progress
   - results
   - history
   - saved searches with schedules
   - the CSV import wizard
   - manual add
3. **The review queue.** Where a team member reads the evidence, checks the drafted message, and approves, edits, rejects or regenerates it in seconds, mostly from the keyboard. It includes the "Send on WhatsApp" flow for assisted channels.

Clicking a service-line tab searches **only that line**. There's no global "search everything" button.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` and `docs/decisions.md` (the visual direction ADR from Phase 4)
2. `docs/specs/module-acquisition.md`: the tabs, search, saved searches and review queue sections, with their screen states
3. **`docs/prompts/wave-4-prep-and-merge.md`:** the route map (B1), `SEAM-LINE-CONTEXT` (you're the **provider**), and **the UI quality bar (B3), which you must meet in full**
4. `phases/04/SUMMARY.md` ("How to build a screen") and the `/dev/ui` gallery. Run the app and look at it.
5. The service READMEs you'll call:
   - `@/modules/acquisition/sourcing` (`runSearch` job, `estimateSearchCost`, runs, saved searches, CSV import, manual add, source stats)
   - `@/modules/acquisition/outreach` (review queue services, approve, edit, reject, regenerate, snooze, `streamDraftEdit`, `prepareWhatsApp`, `prepareLinkedIn`, `markAssistedSent`)
   - `@/modules/acquisition/scoring` (`getLeadScore`, review accept and override)
   - `@/modules/acquisition/crosssell`
   - `@/modules/acquisition/compliance` (`getContactability`)
   - `@/modules/acquisition/audits` (findings with signed artifact URLs)
   - `@/modules/acquisition/inbox` (`getInboxCounts`)
   - `@/modules/acquisition/profiles` (default keywords and sources per market)
   - `@/platform/jobs`, `@/platform/auth`
6. `phases/*/SUMMARY.md` for every completed phase
7. The global skills **`saas-ui`** (in full, including motion and patterns), `saas-testing` and `saas-review`

---

## What you own

- `src/app/(platform)/acquisition/layout.tsx` and `page.tsx`
- `src/app/(platform)/acquisition/[line]/layout.tsx` and `page.tsx`
- `src/app/(platform)/acquisition/[line]/search/**` and `[line]/review/**`
- `src/modules/acquisition/ui/shell/**`, `ui/search/**` and `ui/review/**`
- `phases/15/**`

---

## Step 1: The module shell

1. **`@/modules/acquisition/ui/shell`** exports `resolveLine`, `lineHref` and `LINE_SLUGS`, exactly as `SEAM-LINE-CONTEXT` defines them. An invalid slug gives `notFound()`.
2. **`acquisition/layout.tsx`:**
   - a module header with the module name and the **service-line tab bar**: four line tabs plus Overview, each with its line accent indicator (from the Phase 4 tokens)
   - tabs the user can't access (per role and service-line scope) are hidden
   - on mobile, the tab bar scrolls horizontally with snap, and the active tab stays in view
3. **`[line]/layout.tsx`:** the **section navigation** for the line: Search, Review, Pipeline, Inbox, Analytics, Settings.
   - **Live count badges:** Review (items waiting for this user or this line), Inbox (unread and actionable), and Pipeline (overdue next actions). They come from the services, are streamed with Suspense, and refresh through light polling or revalidation after mutations.
   - A subtle line identity: the accent colour and the line's one-line description from its profile.
   - A **capacity indicator** when the line's throttle is `SLOW` or `PAUSED`. It's a small, clear banner explaining what's happening and linking to the team capacity page (`/admin/team`).
4. **Redirects:** `/acquisition` and `/acquisition/[line]` behave as the route map says.
5. **Command palette:** register "Go to [line] › [section]" for every line and section the user can access, "Run a search in [line]" and "Open review queue".

---

## Step 2: Search (`[line]/search/`)

The screen has a **search panel** and a **live results area**. Design it as a focused tool, not a form on a card.

1. **The search panel:**
   - **Market:** a segmented control for Nigeria / International / Both. The default comes from the user's last choice, remembered in the URL and user settings.
   - **Location:**
     - a combobox with Nigerian cities (Lagos, Abuja, Port Harcourt, Warri, Benin City, Ibadan, Kano, Enugu and others) when Nigeria is selected
     - countries and major cities (UK, US, Ireland, Canada and so on) when International is selected
     - free text is allowed
     - with Both, two location fields appear, one per market
   - **Keywords:** a tag input pre-filled from the line profile's defaults for the chosen market(s), editable.
   - **Sources:** a multi-select of the adapters that apply to this line and the chosen markets. Each shows its market applicability, a short description, and, if disabled, the reason (for example "Jobberman: disabled because its terms don't allow automated access"). The defaults come from the profile.
   - **Limit:** a slider with presets (25 / 50 / 100 / 250).
   - **Estimated cost:** a live `estimateSearchCost` result shown next to the Run button (provider calls plus approximate cost). It warns when the run would pass a budget cap.
   - **Actions:** **Run now** and **Save as scheduled search**.
   - Validation is inline. The Run button shows a pending state.
2. **Live run progress** (the signature moment of this screen):
   - **Run now** enqueues the job and shows a live run panel:
     - each source's status (queued, running, done, failed, capped)
     - animated counters: fetched, new companies, matched, leads created, suppressed, out of market
     - new leads appearing in a list as they're created, with the company, city or country, market badge, strongest signal, and a quick link to the lead
   - Updates come from polling `getSearchRun` (or streaming, if the service supports it), roughly every 2 seconds while running, and then stop.
   - A partial run shows which source failed and why, with **Retry this source**.
   - When the run finishes: a summary line plus next steps ("17 new leads are being enriched and audited. They'll appear in Review when drafts are ready.").
3. **Results and history:**
   - Below the panel, a DataTable of recent runs for this line: when, who, market, location, keywords, sources, counts, cost and status.
   - Filters (market, status, who) live in the URL.
   - `/search/runs/[runId]` is the full run page: the spec, per-source results and errors, and the leads created (DataTable linking to lead detail).
4. **Saved searches** (`/search/saved`):
   - a list showing the name, spec summary, human-readable schedule ("Weekdays at 09:00 WAT"), next run, last run and its results, owner, and enabled status
   - a clear **"Skipped: line at capacity"** state when it applies
   - **Create or edit** in a Sheet:
     - the same fields as the panel, plus a name
     - schedule presets (daily, weekdays, every 6 hours, weekly) or a custom cron with a live human-readable preview and the next 3 run times in the chosen timezone
     - timezone (default `Africa/Lagos`)
     - owner
   - Actions: pause/resume, run now, duplicate, delete (with confirmation).
5. **CSV import wizard** (`/search/import`), using the Phase 4 stepper pattern:
   1. upload (dropzone, direct upload, size and type checked)
   2. column mapping with auto-detection and a sample preview
   3. validation preview: valid, warnings, errors, with row-level messages and a downloadable error CSV
   4. **attestation:** "I confirm this data was not purchased and was collected lawfully", which is required
   5. import with progress, then the run page
6. **Manual add:** a "+ Add lead" action opens a Sheet form: company name, website or social URL, phone, email, contact name and role, city, country (market derived and shown), and notes. It submits through the manual adapter and links to the new lead.

---

## Step 3: The review queue (`[line]/review/`)

This is the most important interaction in the product. People may review dozens of leads a day, so **speed, clarity and trust** matter above everything.

1. **Layout:**
   - **Desktop:** focus mode with one lead at a time, using Phase 4's `ReviewCard` pattern.
     - **Left rail:** the queue list (company, market badge, score, flags) with position "7 of 23".
     - **Main area:**
       - **Context:** company name, city or country, market, website or social links, the **brief**, the score meter with an expandable reasons list, the **contactability verdict** (email, WhatsApp, LinkedIn, phone, each with its status and reason), a cross-sell notice if relevant, and a borderline notice with Claude's recommendation.
       - **Evidence:** the findings used in the draft, as evidence chips with severity, claim, method (measured, observed or AI-judged), source link and capture date. A screenshot thumbnail opens a lightbox.
       - **Draft:** the channel, subject (for email), and body in an editor.
   - **Mobile:** a single column in this order: context, evidence, draft, then a sticky action bar.
   - A **list mode** toggle shows a compact table for managers who triage in bulk.
2. **Citation highlighting:** each cited finding is linked to the sentence that uses it. Hovering or focusing a citation marker in the draft highlights its evidence chip, and the reverse. A sentence without a citation gets a subtle warning style, if the validator flagged it.
3. **Editing:**
   - Inline editing, with validation re-run on the fly (length per channel, banned phrases, links, citations).
   - **AI assist** through `streamDraftEdit`: quick actions (Shorter, Warmer, More direct, Simplify for a non-technical owner) and a free instruction field. Changes stream into the editor, and there's an accept/undo pair.
   - When the text has been edited, a required checkbox appears: **"I confirm every statement about this business is true."** Approve stays disabled until it's ticked.
   - The system footer (signature, unsubscribe, postal address) is shown read-only below the body, so reviewers see exactly what's sent.
4. **Actions,** with shortcuts shown on the buttons and in the "?" overlay:

   | Action | Key | Behaviour |
   |---|---|---|
   | Approve | `A` | Optimistic. The card animates out and the next lead appears. Failures roll back with the reason (for example "Contact was suppressed a moment ago"). |
   | Edit | `E` | Focuses the editor |
   | Reject | `R` | A dialog with the fixed reason list plus a note, and an option to also disqualify the lead |
   | Regenerate | `G` | An optional instruction, then a new draft streamed in |
   | Snooze | `S` | Presets: tomorrow, next week, a date |
   | Next / previous | `J` / `K` | |
   | Open lead | `O` | Opens the lead detail (the Phase 16 route) in a Sheet or a new tab |
   | Accept Claude's recommendation / override | `Y` / `N` | Borderline leads only |

5. **Assisted channels:**
   - **Send on WhatsApp:** a prominent button when the step's channel is WhatsApp.
     1. It calls `prepareWhatsApp`, then opens the `wa.me` link in a new tab.
     2. The card switches to "Did you send it?" with **Mark as sent** or **Not sent**.
     3. Mark as sent calls `markAssistedSent`.
     4. The WhatsApp number shows as "confirmed" or "likely", honestly.
   - **LinkedIn:** a copy-message button plus "Open company page", then mark as sent.
   - **Call task:** shows the talking points, then an outcome form.
6. **Filters,** in the URL: market, owner, flags (needs human review, compliance review), channel, score range. **Empty state:** "Queue clear", with the time the next drafts are expected, and a link to Search.
7. **Safety cues:**
   - Compliance-review items show an unmistakable notice explaining why (for example "UK company. Legal form unknown, so email needs review").
   - If email is blocked but WhatsApp is allowed, the channel switch is explained.

---

## Step 4: Tests and quality

Meet **every item in the Wave 4 UI quality bar (B3)**. In addition:

- **Component tests:**
  - the search panel (market toggle switches the locations and sources; the cost estimate updates)
  - the cron preview
  - the CSV mapping step
  - the ReviewCard (citation highlighting; the Approve button disabled until confirmation after an edit; keyboard shortcuts)
  - the WhatsApp send-and-confirm flow
- **Playwright,** in `tests/e2e/phase-15/`, on desktop and mobile, with seeded and mocked data:
  - switch tabs; badges show counts
  - run a Nigeria search in Web Development and watch the live counters and new leads appear
  - save a scheduled search and see the next run times
  - complete a CSV import including the attestation
  - in the review queue, approve with `A`, edit then approve with confirmation, reject with a reason, regenerate
  - prepare a WhatsApp send and mark it sent
  - a `SERVICE_LEAD` for Video Editing can't see the Web Development review queue
- **Playwright MCP visual review** of every screen, as described in B3.14.

---

## Constraints

- **Only use the existing services.** If a service is missing something the UI truly needs (for example a count endpoint), raise it in `REQUESTS.md` and derive it from existing services in the meantime.
- **No new generic primitives** (B3.1).
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The module shell has line tabs, section navigation with live badges, the capacity banner and redirects, and `SEAM-LINE-CONTEXT` is provided exactly.
- [ ] Search works: the panel with the market toggle, sources with disabled reasons, cost estimate, live run progress with arriving leads, run history and run page, saved searches with schedule preview, CSV import with attestation, and manual add.
- [ ] The review queue works: focus and list modes, citation highlighting, editing with validation and AI assist, human confirmation, keyboard actions, optimistic approve with rollback, assisted WhatsApp, LinkedIn and call flows, and the borderline accept/override.
- [ ] The Wave 4 UI quality bar is met, the tests pass, and axe is clean.
- [ ] `pnpm check` and `pnpm test:e2e` pass.
- [ ] `saas-review` is clean of Critical and Major findings, with the saas-ui finish checklist applied.
- [ ] `phases/15/SUMMARY.md` (including the visual review notes) and `phases/15/REQUESTS.md` are written.
