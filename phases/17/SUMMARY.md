# Phase 17: Analytics and the Overview tab: Summary

| | |
|---|---|
| Phase | 17, Analytics and the Overview tab |
| Branch | `phase/17-analytics` |
| Batch / wave | B6 / Wave 4 |
| Date finished | 2026-10-03 |
| Prompt | `docs/prompts/wave-4/phase-17-analytics.md` |
| Verification | `pnpm lint`: Pass · `pnpm typecheck`: Pass · `pnpm build`: Pass (both routes compiled) · analytics unit tests (36): Pass · 50k perf budget: Pass (`PERF=1`) · full `pnpm test` (after an owner-consented `pnpm db:reset` + test-DB reseed): 1119 passed / 17 failed / 7 skipped — **zero analytics failures**; the 17 are pre-existing cross-module integration tests (sourcing, outreach, scoring, directory, batch-b1, wave-2-pipeline) sensitive to the shared test-DB seed state, in modules Phase 17 doesn't own · `pnpm test:e2e`: specs written, run at integration · `saas-review`: no Critical/Major |

## What was built

The Client Acquisition analytics layer and its two screens. A single typed **metric registry**
(`analytics/metrics.ts`) defines every metric in module spec §3.14 (M17-AC1). A cached, authorised
**data layer** computes the funnel, time series, breakdowns (market, country, source, signal, owner,
channel, pitch angle), the recipient-local reply heatmap, SLA responsiveness, revenue per currency,
line-scoped cost, score calibration and the cross-line overview — reusing the Phase 11/14 services
and never summing money across currencies (INV-11) or mis-bucketing time (INV-12). The **line
analytics page** (`/acquisition/[line]/analytics`) is an editorial report with a URL-driven filter
bar, a headline stat row, and sections for the funnel, trends, what converts, markets,
responsiveness, revenue, efficiency and score calibration — each with an info tooltip, states, a
data-table fallback and CSV export. The **Overview tab** (`/acquisition/overview`) compares the four
lines, with capacity/throttle, cross-sell, market split, AI spend and deliverability, scoped to the
viewer's lines (US-39; AC-39.1–39.3). A **weekly insight** AI task
(`acquisition.analytics-weekly-insight`) with a number-consistency check and 8 evals, and a **Monday
08:00 report job** (`acquisition.analytics.weekly-report`) email managers and admins (US-43;
AC-43.1–43.3). The 50k-lead performance budget (M17-AC3) is met without a rollup.

Meets: M17-AC1, M17-AC2 (AC-38.1–38.4, AC-39.1–39.3), M17-AC3, M17-AC4 (AC-43.1–43.3), M17-AC5
(the drill-down link is built; the leads list it targets is Phase 16, wired at integration).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/analytics/metrics.ts` | The typed metric registry (every §3.14 metric). |
| `src/modules/acquisition/analytics/types.ts` | Result types passed to the UI as plain props. |
| `src/modules/acquisition/analytics/time.ts` | Lagos/recipient timezone bucketing, range presets, previous-period. |
| `src/modules/acquisition/analytics/compute.ts` | Pure metric assembly (rates, funnel, revenue rows, deltas). |
| `src/modules/acquisition/analytics/format.ts` | Intl formatters (shared by UI and the insight builder). |
| `src/modules/acquisition/analytics/cache.ts` | 5-minute `unstable_cache` wrapper + `revalidateAnalytics`. |
| `src/modules/acquisition/analytics/queries/*.repo.ts` | All DB aggregation (funnel, rates, time-series, breakdown, heatmap, sla, durations, cost, mailbox, overview, users). |
| `src/modules/acquisition/analytics/service.ts` | Public authorised services (API-A47). |
| `src/modules/acquisition/analytics/insight/*` | Weekly-insight schema, input builder, number-check, generate, report. |
| `src/modules/acquisition/analytics/{tasks,jobs,schedules,settings,notifications}.ts` | AI task, report job, schedule, settings, notification type. |
| `src/modules/acquisition/analytics/perf/analytics-perf.test.ts` | 50k-lead performance budget (local, `PERF=1`). |
| `src/modules/acquisition/analytics/{compute,time,metrics}.test.ts`, `insight/number-check.test.ts` | Hand-calculated unit tests. |
| `src/modules/acquisition/ui/analytics/**` | Filter bar, charts (funnel, heatmap, conversion bars, trend, comparison), CSV button, info tooltip, `_seams.ts`. |
| `src/app/(platform)/acquisition/[line]/analytics/{page,_sections,loading,error}.tsx` | The line analytics page. |
| `src/app/(platform)/acquisition/overview/{page,loading,error}.tsx` | The overview tab. |
| `runtime-skills/acquisition/analytics-weekly-insight/SKILL.md` | The weekly-insight system prompt. |
| `evals/acquisition/analytics-weekly-insight/**` | 8 eval cases (incl. small-sample trap, source-name injection) + mock fixture. |
| `tests/e2e/phase-17/analytics.spec.ts` | Playwright specs for the two screens. |

## Public interfaces other phases can use

```ts
// @/modules/acquisition/analytics
export async function getLineAnalytics(actor: Actor, filters: LineAnalyticsFilters): Promise<LineAnalytics>; // acquisition.analytics.read
export async function getFunnel(actor: Actor, filters: LineAnalyticsFilters): Promise<FunnelResult>;
export async function getTimeSeries(actor: Actor, filters: LineAnalyticsFilters, granularity: Granularity, metricIds?: MetricId[]): Promise<TimeSeriesResult>;
export async function getBreakdown(actor: Actor, filters: LineAnalyticsFilters, dimension: BreakdownDimension): Promise<BreakdownResult>;
export async function getReplyHeatmap(actor: Actor, filters: LineAnalyticsFilters): Promise<ReplyHeatmapResult>;
export async function getResponsiveness(actor: Actor, filters: LineAnalyticsFilters): Promise<SlaByOwnerRow[]>;
export async function getEfficiency(actor: Actor, filters: LineAnalyticsFilters): Promise<EfficiencyResult>;
export async function getCalibration(actor: Actor, filters: LineAnalyticsFilters): Promise<CalibrationRow[]>;
export async function getOverview(actor: Actor, filters: OverviewFilters): Promise<OverviewResult>; // acquisition.overview.read per line
export function revalidateAnalytics(): void;
export const METRICS; export function getMetric(id: MetricId): MetricDefinition;
export async function generateWeeklyInsight(actor: Actor, input: WeeklyInsightInput): Promise<GeneratedInsight>;
export async function runWeeklyReport(now: Date, jobRunId: string): Promise<WeeklyReportResult>;
export const analyticsTasks, analyticsJobs, analyticsSchedules, analyticsSettings, analyticsNotificationTypes;
export function registerAnalyticsTasks(): void;
```

- **Routes:** `/acquisition/[line]/analytics` (R-A13), `/acquisition/overview` (R-A2).
- **AI task:** `acquisition.analytics-weekly-insight` (balanced). **Job:** `acquisition.analytics.weekly-report`.
- **Schedule:** Mon 08:00 `Africa/Lagos`. **Settings:** `acquisition.analytics.weeklyReportEnabled`, `acquisition.analytics.lowSampleThreshold`.
- **Notification type:** `analytics.weekly-report`. These are registered on the manifest by Phase 19 (CR-17-02).

## Decisions made

- **Caching:** the project doesn't enable Cache Components, so `"use cache"` is unavailable. Used the
  documented "previous model" `unstable_cache` (`{ revalidate: 300, tags: ["acq-analytics"] }`), with
  the permission check kept outside the cache. Under Vitest (no Next request scope) the wrapper is a
  no-op, so tests measure uncached query speed. (CR-17-05 offers the `"use cache"` upgrade path.)
- **Line-scoped AI cost** is computed directly from `AiCall` joined to `Lead`, because `@/platform/ai`
  `getUsageSummary` is `platform.aiUsage.read`-gated (admin-only) and has no service-line dimension.
- **URL filters** use `next/navigation` (the established convention), not nuqs (unmounted adapter).
- **New charts** (funnel, heatmap, conversion/comparison bars) and the CSV util were built locally
  (B3.1) and offered for promotion (CR-17-03).
- **Overview is defensive:** a missing throttle reading (a line without an active profile) falls back
  to `NORMAL` rather than failing the dashboard.

## Dependencies added

None. (recharts and nuqs were already present from Phase 4.)

## Change requests raised

See `phases/17/REQUESTS.md`: CR-17-01 wire `SEAM-LINE-CONTEXT`; CR-17-02 register the manifest
entries (task, job, schedule, settings, notification type + `docs/contracts/events.md`); CR-17-03
promote candidate primitives; CR-17-04 nuqs adapter (optional); CR-17-05 event-based cache
invalidation / Cache Components; CR-17-06 decide where the Overview insight banner reads its latest
insight; CR-17-07 phase-DB seed gap (environmental). **No schema changes.**

**Seams:** `SEAM-LINE-CONTEXT` — **stubbed** (Phase 15 ran in parallel; stand-in at
`src/modules/acquisition/ui/analytics/_seams.ts`, wiring in CR-17-01).

## Performance (M17-AC3)

50,000 leads with funnel/source/reply/meeting/revenue distributions (`perf/analytics-perf.test.ts`,
`PERF=1`), p95 over 15 runs, local native Postgres 18. Budget: < 800ms. **Met without a rollup.**

| Query | p95 |
|---|---|
| `getLineAnalytics` (with compare) | < 800ms — passes (829ms before, under 800ms after parallelising current + previous into one batch) |
| `getFunnel` | ~264ms |
| `getTimeSeries` | ~139ms |
| `getBreakdown` (signal) | ~138ms |
| `getReplyHeatmap` | ~171ms |
| `getOverview` | ~259ms |

`getLineAnalytics` fires the current and previous windows in a single batch so the compare path
doesn't double the wall-clock time.

## Chart validation (dataviz)

Ran `scripts/validate_palette.js` on the chart-theme categorical series. The validator flags the
teal series' chroma and a borderline amber↔crimson adjacency in Phase 4's locked palette
(`.claude/project-rules.md`, owned elsewhere — changing a token needs a REQUESTS entry and a new
contrast check). Every multi-series chart here (only the trend LineChart uses >1 series) renders a
legend and a `<details>` data-table fallback, so identity is never colour-alone (project-rules; the
dataviz guide permits the CVD floor band with that secondary encoding). Funnel/conversion/comparison
charts are single-series or per-line accented with direct labels; the heatmap uses the sequential ramp.

## Known limitations

- **Overview insight banner** (spec Step 5 "shown at the top of Overview"): the insight is generated
  and emailed by the Monday job; where the Overview reads the *latest* insight for a banner is
  deferred (CR-17-06), since no table exists for it and settings are Phase-6-owned.
- **Signal-bar → leads drill-down** (M17-AC5) builds the correct `lineHref(line,"leads",{signal,…})`
  URL, but the Phase 16 leads list isn't merged in this worktree, so the navigation is asserted in
  the Wave 4 integration e2e, not here.
- **Playwright e2e** (`tests/e2e/phase-17/`) is written but not run in this worktree: it needs a prod
  build + the seeded DB, and the cross-phase pieces (shell tabs, leads list) arrive at integration.
- Test DB seed gap (CR-17-07) makes some pre-existing scoring integration tests fail until a
  `pnpm db:reset` (owner-run; Prisma blocks agent resets).

## How to test it

- **Unit:** `pnpm exec vitest run src/modules/acquisition/analytics` — metric registry completeness,
  every formula, cohort/period, currency separation, Lagos + recipient-tz bucketing (a 23:30 UTC
  reply lands next day in Lagos), low-sample flagging, and the insight number-check.
- **Performance:** `PERF=1 pnpm exec vitest run src/modules/acquisition/analytics/perf` (local only).
- **Screens (mock mode):** sign in as `manager@futureuni.local` (sees all lines) and open
  `/acquisition/web-development/analytics` and `/acquisition/overview`; change the range/market and
  toggle compare (the URL updates and the charts re-render); export a chart's CSV. Sign in as
  `kelechi@futureuni.local` (MEMBER of Web + Graphic) and open `/acquisition/video-editing/analytics`
  to see the no-permission state (AC-38.4). Sign in as `web.lead@futureuni.local` for the line-scoped
  overview (AC-39.2).
- **e2e:** `pnpm test:e2e --grep @smoke` (prod build; run at integration with the full stack).
