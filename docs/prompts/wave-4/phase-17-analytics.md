# Phase 17: Analytics and the Overview Tab

> **How to run this phase**
> 1. Wave 3 must be merged and integrated, and Part A of `wave-4-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 17 analytics`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-17-analytics.md and execute it. Plan first."**
>
> Wave 4. Runs in parallel with Phases 15, 16 and 18. Depends on Waves 0–3.

---

## Your role and the goal of this phase

You show FUTUREUNI **what's actually working**:

- which service lines, markets, sources and signals turn into replies, meetings and revenue
- where leads get stuck
- how fast the team responds
- what the AI costs per won deal

The management team will judge the platform by these screens.

**You deliver:**

1. **The analytics data layer** (`src/modules/acquisition/analytics/`): typed, tested aggregation services over the existing tables and the Phase 11 and 14 data services, with caching.
2. **Line analytics** (`/acquisition/[line]/analytics`): the funnel, rates, time series, splits by market, source and signal, response performance, revenue, cost, and score calibration.
3. **The Overview tab** (`/acquisition/overview`): all four lines side by side, cross-sell opportunities, capacity and throttle status, revenue and AI spend.
4. **An optional weekly insight:** a short Claude-written "what changed" summary that cites the metrics, plus a weekly email report to managers.

**The `dataviz` skill leads the charts.** Use its form heuristic, colour formula and validator, mark specs and interaction rules, together with Phase 4's chart components and `chart-theme.ts`.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (invariant 11: never sum money across currencies; invariant 12: timezones) and `docs/decisions.md`
2. `docs/specs/module-acquisition.md`: **the analytics section** (every metric listed there must appear), plus the Overview tab
3. **`docs/prompts/wave-4-prep-and-merge.md`:** the route map, `SEAM-LINE-CONTEXT` (consumer), and **the UI quality bar (B3), in full**
4. `phases/04/SUMMARY.md` and Phase 4's chart components in `/dev/ui`
5. The data services to reuse (don't re-implement their logic):
   - `@/modules/acquisition/sourcing` (`getSourceStats`)
   - `@/modules/acquisition/scoring` (`getScoreCalibrationData`, throttle status)
   - `@/modules/acquisition/crosssell` (`listCrossSellOpportunities`)
   - `@/modules/acquisition/pipeline` (`getRevenueSummary`, `getLossReasons`, `getMeetingStats`, `getStageConversion`)
   - `@/modules/acquisition/inbox` (SLA outcomes)
   - `@/modules/acquisition/outreach` (mailbox health)
   - `@/platform/ai` (`getUsageSummary`, `getCostPerOutcome`)
   - `@/platform/team`
6. The Prisma models you'll query directly for aggregates: `Lead`, `LeadEvent`, `Signal`, `SearchRun`, `Message`, `Reply`, `Meeting`, `Proposal`, `Deal`, `AiCall`
7. `phases/*/SUMMARY.md` for every completed phase
8. The global skills **`dataviz`** (in full, including `references/palette.md`), `saas-ui` (dashboards reference), `saas-data` (query patterns, no N+1), `saas-testing` and `saas-review`

---

## What you own

- `src/app/(platform)/acquisition/[line]/analytics/**`
- `src/app/(platform)/acquisition/overview/**`
- `src/modules/acquisition/analytics/**`
- `src/modules/acquisition/ui/analytics/**`
- `runtime-skills/acquisition/analytics-*/**`
- `evals/acquisition/analytics-*/**`
- `phases/17/**`

---

## Step 1: Metric definitions (`analytics/metrics.ts`)

Before writing queries, write **one typed metric registry**. Each metric has:

- an ID, a label, and a plain-language definition (shown in a tooltip in the UI)
- its formula
- the numerator and denominator events
- the unit (count, %, duration, money)
- whether higher is better
- its data source

Definitions must be **unambiguous and consistent everywhere**. At minimum:

| Metric | Definition (summary) |
|---|---|
| `leads_found` | Leads created (`NEW` events) in the period |
| `enrichment_rate` | Leads reaching `ENRICHED` ÷ leads created |
| `audit_rate` | Leads reaching `AUDITED` ÷ `ENRICHED` |
| `qualification_rate` | `SCORED` ÷ `AUDITED` |
| `avg_score` | The mean score of scored leads |
| `approval_rate` | Approved first-touch drafts ÷ first-touch drafts reviewed |
| `sent` | First touches sent (email plus assisted sends confirmed) |
| `reply_rate` | Leads with any non-auto reply (excluding `OUT_OF_OFFICE`, `BOUNCE`) ÷ leads contacted |
| `positive_reply_rate` | `INTERESTED` or `QUESTION` replies ÷ leads contacted |
| `unsubscribe_rate`, `bounce_rate` | Per leads contacted |
| `meetings_booked`, `meeting_rate` | Meetings ÷ positive replies |
| `no_show_rate` | From meeting outcomes |
| `proposals_sent`, `proposal_acceptance_rate` | |
| `won`, `win_rate` | Won ÷ leads contacted, and won ÷ proposals |
| `revenue` | **Per currency**, from won deals |
| `avg_deal_size` | Per currency |
| `time_to_first_reply`, `time_to_close` | Median and p75 |
| `sla_met_rate`, `median_first_response_time` | |
| `cost_per_lead` | Source cost plus AI cost per lead, USD |
| `ai_cost_per_won_deal` | USD |
| `stage_conversion`, `time_in_stage` | |

**Cohort versus period:** support both **period-based** views (events that happened in the date range) and **cohort-based** views (leads created in the range, followed through). Label clearly which one a chart uses. Default the funnel to cohort, and the time series to period.

---

## Step 2: The data layer (`analytics/queries/`, `analytics/service.ts`)

- **`getLineAnalytics({ line, markets, from, to, compare?: "previous_period" | "none", sources?, ownerId? })`:** returns every metric for the line, with the comparison deltas.
- **`getFunnel(...)`:** cohort stage counts and conversion between each step: found → enriched → audited → scored → approved → sent → replied → positive → meeting → proposal → won.
- **`getTimeSeries(metricIds, { granularity: day | week | month, ... })`**
- **`getBreakdown(metricIds, { by: "market" | "country" | "source" | "signal" | "owner" | "channel" | "pitchAngle", ... })`:** conversion by signal and by pitch angle are the most valuable insights, so make them solid.
- **`getReplyHeatmap(...)`:** reply rate by weekday × hour, in the **recipient's local time**.
- **`getOverview({ markets, from, to })`:** every line side by side, cross-sell opportunities, throttle status per line, revenue per currency per line, AI spend per line, and mailbox health summary counts.

**Implementation:**

- Prisma aggregate and groupBy, or tagged SQL (`$queryRaw` with tagged templates only) for the heavier aggregates.
- Always filter on indexed columns.
- No N+1 queries.
- **Money is never summed across currencies.** Return `Record<Currency, number>`.
- Timezone-aware bucketing: bucket in the platform timezone (`Africa/Lagos`) for period views, and in the recipient's timezone for the heatmap.
- **Caching:** cache results per filter set for 5 minutes (Next.js data cache with tags), and invalidate on relevant events where cheap.
- **Performance budget:** extend the seed in a **test-only** data generator to about **50,000 leads** with realistic distributions. Every analytics query must return in **under 800ms at p95** locally. If you can't meet this without pre-aggregation, design a daily rollup table and raise it in `REQUESTS.md` (the schema is owned elsewhere), implement the rollup job behind the same service interface with a feature flag, and document it. Record the timings in your summary.
- All services check `requirePermission` (line-scoped analytics per the matrix: members see only their lines).

---

## Step 3: Line analytics page (`[line]/analytics`)

Design it as an **editorial analytics page, not a wall of widgets**. Follow the dataviz skill's form heuristic for every chart choice, and the Wave 4 UI quality bar.

1. **Header:**
   - a date range with presets (7d, 30d, 90d, quarter to date, year to date, custom)
   - market: Nigeria / International / Both
   - compare with the previous period (toggle)
   - optional filters: source, owner
   - all in the URL
2. **Headline row** (Phase 4's `StatRow`, no cards): leads found, reply rate, meetings, won, revenue (per currency), and AI cost per won deal. Each has a delta against the previous period and a sparkline.
3. **The funnel:** a cohort funnel with conversion % between steps. Hovering or focusing a step shows the counts and drop-off. It can be split by market (Nigeria and International side by side, or overlaid if dataviz allows).
4. **Trends:** a time series of leads found, sent, replies and meetings, with a metric switcher.
5. **What converts:**
   - conversion by **source**, by **signal** and by **pitch angle**, as sorted horizontal bars with sample sizes shown
   - bars with a small n are visually muted, with a "low sample" note
   - a clickable bar links to the leads list filtered accordingly (the Phase 16 route, with query parameters)
6. **Markets:** a Nigeria versus International comparison on the key rates. International can also be split by country.
7. **Responsiveness:**
   - the reply heatmap (weekday × hour, recipient local time), which informs send windows
   - the SLA met rate and median first response time, by owner
8. **Revenue:**
   - won deals and revenue per currency over time
   - average deal size
   - time to close (median and p75)
   - loss reasons (sorted bars)
9. **Efficiency:**
   - cost per lead by source
   - AI cost per won deal
   - AI cost broken down by task (top 5)
10. **Score calibration:** score bands against outcome rates, from Phase 11's data, showing whether higher scores really win more. Include a short note on how to use it to tune profile rules.
11. **Every chart has:**
    - a title stating the insight where possible
    - an info tooltip with the metric definitions
    - loading, empty and error states
    - a data-table view toggle, for accessibility and copying
    - **CSV export** of its data

---

## Step 4: Overview tab (`/acquisition/overview`)

For managers and admins; other roles see only their own lines.

- **Line comparison:** the four lines side by side on the key metrics (leads, reply rate, meetings, won, revenue per currency, cost per won deal), as comparison bars with line accent colours from the tokens.
- **Capacity and throttle:** each line's mode (`NORMAL`, `SLOW`, `PAUSED`), the owners' load against capacity, and nurture-held counts. Links to `/admin/team`.
- **Cross-sell opportunities:** a table of groups (company, lines, leading line, status, combined estimated value), linking to the leads.
- **Market split:** Nigeria versus International across all lines.
- **AI spend:** this period against budget, by line and by task. Links to `/admin/ai-usage` for admins.
- **Deliverability snapshot:** active or paused mailboxes and bounce rates. Links to `/admin/mailboxes` for admins.

---

## Step 5: Weekly insight and report (optional but recommended)

- **The AI task `acquisition.analytics-weekly-insight`:**
  - **Input:** a compact JSON of this week's metrics against last week's, per line and market, with metric IDs and sample sizes.
  - **Output:** `{ headline, points: Array<{ text, metricIds[] }>, watchouts: Array<{ text, metricIds[] }> }`
  - **Every number mentioned must equal an input value.** Use the same number-consistency check approach as Phase 14.
  - It must not claim causes as facts. It uses cautious language on small samples.
  - Evals: at least 8 cases, including a small-sample trap and an injection attempt through a source name.
- **Shown** at the top of the Overview tab as a dismissible insight, with the metrics it cites linked.
- **Job `acquisition.analytics.weekly-report`:** every Monday at 08:00 `Africa/Lagos`, it emails managers and admins the insight plus the headline metrics, through the platform `notify` email channel with a branded template. Export `analyticsJobs` and `analyticsSettings` and list them in `REQUESTS.md`.

---

## Step 6: Tests and quality

Meet **every item in the Wave 4 UI quality bar (B3)**. In addition:

- **Unit tests** on a small, hand-built fixture where every expected value is calculated by hand:
  - every metric formula
  - cohort versus period logic
  - the currency separation
  - timezone bucketing (a reply at 23:30 UTC lands on the next day in Lagos)
  - the heatmap in recipient local time
  - low-sample flagging
- **Performance tests:** the 50,000-lead generator plus timing assertions (local only, not in CI if too slow; document it).
- **Chart validation:** run the dataviz palette validator on the chart theme as used; charts are correct in both themes.
- **Playwright,** in `tests/e2e/phase-17/`:
  - change the range, market and compare settings, and the URL updates and charts re-render
  - click a signal bar and land on the filtered leads list
  - export a CSV
  - the Overview is visible to a manager, and scoped for a service lead
  - mobile layout
- **Evals** for the weekly insight task.
- **Playwright MCP visual review** (B3.14): check that the pages read as a coherent editorial report in both themes.

---

## Constraints

- **Reuse the existing data services.** Put new aggregation only in your folder.
- **No schema edits.** Rollups go through a request.
- **Never sum money across currencies, and never invent numbers in AI text.**
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The metric registry exists, with a definition for every metric in the spec.
- [ ] The data layer covers the funnel, time series, breakdowns (source, signal, pitch angle, market, country, owner, channel), heatmap and overview, with caching, and it meets the performance budget (or has a rollup plan and a request).
- [ ] The line analytics page has every section in Step 3, with definitions, states, table views and CSV export.
- [ ] The Overview tab has every section in Step 4.
- [ ] The weekly insight task with evals and the weekly report job are exported.
- [ ] The Wave 4 UI quality bar is met, the tests pass, and axe is clean.
- [ ] `pnpm check` and `pnpm test:e2e` pass.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/17/SUMMARY.md` (with query timings and visual review notes) and `phases/17/REQUESTS.md` are written.
