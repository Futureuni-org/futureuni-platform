# Phase 19: End-to-End Integration

> **How to run this phase**
> 1. Wave 4 must be merged and integrated (Part C3 of `wave-4-prep-and-merge.md` passed).
> 2. Put this file in `docs/prompts/`. Run `git checkout -b phase/19-integration` on `main` (or `pnpm phase start 19 integration`).
> 3. Open Claude Code. Use Opus at maximum effort and switch to plan mode.
> 4. Say: **"Read docs/prompts/phase-19-integration.md and execute it. Plan first."**
>
> Wave 5, sequential. Depends on everything before it. Phase 20 depends on it.
> **This is the "almost there" point:** after this phase, every feature works together, end to end, on schedules.

---

## Your role and the goal of this phase

Twenty phases have been built in parallel waves, and four integration sessions have connected them. Your job is to turn that into **one coherent system that runs itself**:

- **Every lead moves automatically** from discovery to a draft in the review queue, driven by durable workflows and schedules, with nobody pushing it along.
- **Every leftover change request** in any `phases/*/REQUESTS.md` is resolved: applied, or explicitly rejected with a reason.
- **The acquisition manifest is final:** navigation, permissions, jobs, schedules, settings, notifications, home widgets and commands.
- **The platform home widgets** show real data.
- **The documentation matches the code.**
- **A complete Playwright suite** proves every service line in every market works through the UI, for every role, including scheduled behaviour over simulated time.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md`, `docs/decisions.md` and `phases/README.md`
2. `docs/specs/platform.md`, `docs/specs/module-acquisition.md` and `docs/specs/data-model.md`
3. **Every** `phases/*/SUMMARY.md` and `phases/*/REQUESTS.md`, including the wave-integration summaries
4. `src/modules/acquisition/manifest.ts` (yours now), `src/platform/registry/`, and every module area's `jobs.ts`, `settings.ts`, `schedules.ts`, `notifications.ts` and `tasks.ts`
5. The READMEs of every platform service and acquisition area
6. The global skills `saas-testing` (end-to-end and smoke), `saas-review`, `saas-data` and `saas-api`

Use Context7 for the current Vercel Workflow docs (the triggering workflows from events section, concurrency, and the step duration limits on Vercel) and for Playwright's clock API.

---

## What you own

- `src/modules/acquisition/manifest.ts`
- `src/modules/acquisition/workflows/**`
- `tests/e2e/**`
- `tests/integration/**`
- `docs/architecture.md`

Applying change requests may touch any path. Do it deliberately, list every file changed per request, and run on a phase branch with `FU_ALLOW_ALL=1` set for request application only.

---

## Step 1: Resolve every change request

1. Build **`phases/19/REQUESTS-INDEX.md`**, a table of every request across all phases with these columns: ID, phase, type (schema, contract, doc, ownership, primitive promotion, service gap, setting, other), summary, status (already applied in a wave integration / apply now / reject), reason and files changed.
2. **Apply** the open ones:
   - schema changes as **one new migration** per logical change, following saas-data's expand → migrate → contract approach where data exists
   - contract changes, with every implementer updated
   - service gaps that the UI worked around (for example missing count endpoints): implement them properly, and switch the UI to the new version
   - primitive promotions
3. **Reject** anything that conflicts with the specs or rules, with a written reason.
4. After this step, no request is left open.

---

## Step 2: The final acquisition manifest

Make `manifest.ts` the complete, single declaration of the module:

- **Navigation:** the overview plus four line tabs with sections, badges, icons and permission gates, matching the route map in `wave-4-prep-and-merge.md` exactly.
- **Permissions:** every acquisition action from the project-rules matrix. Test that the manifest and the matrix fixture are identical.
- **Jobs:** every job from every area, with the concurrency, timeout and retry policies reviewed together, so no two jobs fight over the same leads.
- **Schedules:** every static schedule, with times deliberately staggered (`Africa/Lagos`), plus the sourcing dynamic-schedule provider.
- **Settings, notification types, AI task registration, home widgets and command-palette commands.**
- Then `pnpm registry:gen`. `getAllJobs()`, `getCronSchedules()` and `getNavigation()` for each role must match expectations in a test.

Write **`docs/schedules.md`:** a table of every scheduled job, with when it runs (local time), what it does, the typical duration, cost drivers and its safety limits.

---

## Step 3: Pipeline orchestration (`src/modules/acquisition/workflows/`)

1. **The lead-advance workflow** (Vercel Workflow), `acquisition.lead.advance`, is started when a lead is created (subscribe to the lead-created event) and when a lead is re-queued. Its steps:
   1. enrich (Phase 9 service)
   2. audit (Phase 10)
   3. score and brief (Phase 11)
   4. first-touch draft (Phase 12), **only if** the lead is `SCORED`, is the leading lead of any cross-sell group, and the line's throttle allows it

   Each step:
   - checks the lead's current status first (idempotent; skips if already done)
   - respects the per-lead cost caps
   - is retried by Workflow on transient failure, resuming from the failed step
   - the whole run's idempotency key is `leadId + advanceVersion`
2. **Concurrency and fairness:**
   - Limit concurrent advance workflows per line and globally (settings), so one big search can't starve other lines or blow through provider quotas.
   - Order the queue by score where known, otherwise first in, first out.
3. **Sweepers as a safety net.** The Wave 2–3 batch jobs remain, but become **sweepers**: every 30 minutes they pick up leads stuck in a status longer than a threshold (for example `ENRICHING` over 2 hours) and restart their advance workflow. After N restarts, the lead is flagged for manual attention, with a notification.
4. **Downstream triggers,** checked end to end:
   - reply received → inbox processing
   - booking webhook → meeting
   - meeting minus 2 hours → pre-call brief
   - won → handoff, load recalculation, throttle re-evaluation and release
5. **Record** the full event → subscriber → job map in `docs/architecture.md`.

---

## Step 4: Platform home and cross-module glue

- Wire the Phase 4 home widgets to the real services:
  - **"My review queue":** count plus the top 3
  - **"My inbox":** actionable count, SLA warnings
  - **"Pipeline value":** open value per currency, meetings today
  - **"Needs you":** overdue next actions, nurture follow-ups due, stale leads
  - **recent activity**
- Navigation badges and the platform home must agree on counts. Test it.
- Register the acquisition part of `platform.retention-purge`, and confirm the dry run shows the expected candidates.
- Confirm every notification type has a sender, a template or in-app rendering, and a preference entry.

---

## Step 5: Clean-up

- No `SEAM:` markers, no stand-ins, no stray `TODO`s without an owner. Make a list of the remaining TODOs, each with a reason.
- Remove dead code and unused exports and dependencies (use a tool such as `knip`), and resolve its findings.
- Every folder README is accurate.
- **Documentation matches the code:**
  - `docs/specs/data-model.md` is regenerated or updated from the final Prisma schema, including the ER diagram
  - `docs/contracts/*` match `src/contracts/*`
  - `CLAUDE.md` and the ownership map reflect reality
  - `.claude/project-rules.md` "Stack and commands" is current
- Write **`docs/architecture.md`:**
  - the system overview (a Mermaid diagram)
  - the module system
  - the platform services
  - the acquisition pipeline and lifecycle diagram
  - events and jobs
  - AI usage points
  - data flows for compliance
  - where each invariant is enforced, with file references

---

## Step 6: The complete end-to-end suite (`tests/e2e/`)

Use mock providers, the seeded database, and **Playwright's clock control** to simulate days passing.

1. **Journeys, one per service line × market (8 in total),** run through the UI as the line's `SERVICE_LEAD`:
   1. run a search with that line's typical query
   2. leads flow automatically (workflows running) until drafts appear in review, without anyone triggering enrichment or audits
   3. approve a draft: an email for International, a WhatsApp prepare-and-confirm for the Nigeria first touch
   4. advance time. The next sequence step appears or sends inside the recipient's send window, never outside it.
   5. a scripted `INTERESTED` reply arrives. The inbox classifies it, the sequence stops, and the owner is notified.
   6. reply with the AI draft, including the booking link
   7. a booking webhook fires. Meeting booked, and the pre-call brief appears 2 hours before.
   8. record the outcome, build a proposal (priced by the server), send it, then mark it won. The handoff is created and assigned by capacity.
   9. the analytics for the line reflect the journey
2. **Branch journeys:**
   - `NOT_NOW` with a date: nurture, then the reminder on that date after a time jump
   - unsubscribe through the **one-click endpoint**, and separately by reply: a suppression, a company-wide stop, and no further sends even after a time jump
   - `WRONG_PERSON` with a referral: a verified contact and a proposed draft
   - `OUT_OF_OFFICE`: paused, then resumed after the return date
   - a hard bounce: suppressed, stopped, and the mailbox health updated
   - a UK sole trader: email blocked, and the assisted channel offered
   - capacity: filling a line's capacity pauses first touches, sends new leads to nurture, and skips saved searches; freeing capacity releases leads in score order
   - cross-sell: one company qualifying for two lines ends up with one thread only
   - a scheduled saved search runs through the cron tick endpoint (with the secret) at its scheduled time
   - a stuck lead is picked up by the sweeper
   - a provider failure (the mock failure mode) leaves the run partial and the retry succeeds
3. **Role matrix:** for each role, visit every route in the route map and assert the correct allowed, hidden or no-permission behaviour. Attempt forbidden server actions directly and assert 403.
4. **Smoke subset (`@smoke`):** sign in, the home loads, run a search, the review queue loads, approve, the inbox loads, the pipeline loads, analytics load. This is the suite `saas-ship` will run against preview and production deployments.
5. The suite runs on desktop and mobile projects, and is stable: run it 3 times in a row with no flaky failures. Fix flakiness at the root, never with sleeps.

---

## Step 7: Staging dataset

Create **`pnpm seed:staging`**: a realistic, larger dataset (a few hundred leads across all lines, markets and statuses, with realistic timelines over the last 90 days) that makes analytics meaningful. It refuses to run against production. Phase 21 uses it for the preview environment.

---

## Constraints

- **Fix integration bugs at the root,** in the owning area, and note each fix in the summary.
- **Don't add features** beyond what the specs and prompts define.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] `REQUESTS-INDEX.md` shows every request resolved.
- [ ] The final manifest is complete and tested against the permission matrix, route map and schedules. `docs/schedules.md` is written.
- [ ] The lead-advance workflow, concurrency, sweepers and downstream triggers work automatically.
- [ ] The platform home widgets use real data, and the counts agree everywhere.
- [ ] The clean-up is done: no seams, dead code removed, and the docs regenerated and accurate. `docs/architecture.md` is written.
- [ ] The full end-to-end suite passes 3 runs in a row: 8 journeys, every branch, the role matrix, and `@smoke`.
- [ ] `pnpm seed:staging` works.
- [ ] `pnpm check` and `pnpm test:e2e` pass.
- [ ] `saas-review` has been run on the whole Phase 19 diff, with every Critical and Major finding fixed.
- [ ] `phases/19/SUMMARY.md` is written.
