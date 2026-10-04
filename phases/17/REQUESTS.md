# Phase 17 — change requests

Applied at Wave 4 integration (batch B6, `docs/prompts/wave-4/wave-4-prep-and-merge.md` Part C3).
Phase 17 owns only its paths; everything below is outside them.

## CR-17-01 — Wire SEAM-LINE-CONTEXT (seam)

**Stubbed.** Phase 15 (`@/modules/acquisition/ui/shell`) was running in parallel, so the consumer
stand-in lives at `src/modules/acquisition/ui/analytics/_seams.ts` with `// SEAM:SEAM-LINE-CONTEXT`
markers. It exports the fixed signature: `resolveLine(slug)`, `lineHref(line, section?, query?)`,
`LINE_SLUGS`. Note the analytics stub implements the **general** `lineHref` path form
(`/acquisition/<slug>/<section>?<query>`), which the drill-downs rely on (e.g.
`lineHref(line, "leads", { signal, from, to, market })` → the Phase 16 leads list, M17-AC5).

At integration:
1. Repoint the re-export in `src/modules/acquisition/ui/analytics/index.ts` and the import in
   `src/app/(platform)/acquisition/[line]/analytics/page.tsx` (and the overview page) from
   `./_seams` / `@/modules/acquisition/ui/analytics` to `@/modules/acquisition/ui/shell`.
2. Delete `src/modules/acquisition/ui/analytics/_seams.ts`.
3. Confirm `grep -r "SEAM:" src` is empty for this seam.
4. Verify Phase 15's `lineHref` produces the general section path so M17-AC5 (signal bar → leads)
   resolves; if it only builds `/settings`, extend it.

## CR-17-02 — Register the analytics manifest entries (manifest + contract)

Add to `src/modules/acquisition/manifest.ts`:
- **AI task** `acquisition.analytics-weekly-insight` — `analyticsTasks` / `registerAnalyticsTasks()`
  from `@/modules/acquisition/analytics`.
- **Job** `acquisition.analytics.weekly-report` — `analyticsJobs`.
- **Schedule** — `analyticsSchedules` (Mon 08:00 `Africa/Lagos`).
- **Settings** — `analyticsSettings` (`acquisition.analytics.weeklyReportEnabled`,
  `acquisition.analytics.lowSampleThreshold`).
- **Notification type** `analytics.weekly-report` — `analyticsNotificationTypes`; also add it to
  `docs/contracts/events.md` §3a (owner: Phase 0) in the same change.

The permission actions used (`acquisition.analytics.read`, `acquisition.overview.read`) are already
in the project-rules matrix and the manifest, so no matrix change is needed.

## CR-17-03 — Promote candidate primitives (B3.1)

Built locally under `src/modules/acquisition/ui/analytics/` because they didn't exist in Phase 4:
- `charts/funnel-chart.tsx`, `charts/heatmap-chart.tsx`, `charts/conversion-bars.tsx`,
  `charts/comparison-bars.tsx` — if two or more Wave 4 phases built similar charts, promote the
  shared ones into `src/components/charts` and replace the duplicates.
- `csv.ts` (`toCsv` / `csvCell`) — a generic CSV builder; promote to `src/lib` and replace the
  audit-log module's private copy (`src/platform/audit-log/service.ts`).
- `info-tooltip.tsx` — a generic metric/info tooltip; promote to `src/components` if others need it.

## CR-17-04 — URL filters: nuqs adapter (optional)

The analytics filters use `next/navigation` directly (the project's established convention; see
`src/components/admin/filters.tsx`). The Wave 4 bar mentions nuqs, which is installed but has no
`NuqsAdapter` mounted. If nuqs is adopted platform-wide, mount `NuqsAdapter` in the Phase-4-owned
root layout and migrate the filter bars; otherwise this is a no-op.

## CR-17-05 — Cache invalidation on events (service gap, optional)

Analytics results are cached for 5 minutes with `unstable_cache` (tag `acq-analytics`) via
`src/modules/acquisition/analytics/cache.ts`. `revalidateAnalytics()` is exported but not yet
wired. At integration, call it from the handlers for `deal.won`, `deal.lost`, `reply.received`,
`lead.statusChanged` and `meeting.booked` so dashboards refresh sooner than the TTL. Separately,
consider enabling Next 16 Cache Components (`cacheComponents` in the Phase-1-owned `next.config.ts`)
to move from the deprecated `unstable_cache` to the `"use cache"` directive.

## CR-17-06 — Weekly insight on the Overview tab (decision needed)

The weekly insight (`acquisition.analytics-weekly-insight`) is generated and emailed by the Monday
job (`runWeeklyReport`). Module spec §5 also wants it shown at the top of the Overview tab as a
dismissible banner. That needs a readable "latest insight" the page can load cheaply. Options:
(a) the job writes the latest insight to a MODULE setting (`acquisition.analytics.latestInsight`)
that the overview reads; (b) the overview generates on demand, cached. Deferred pending a decision
on where the insight is stored (no schema table exists for it, and settings are Phase-6-owned).

## CR-17-07 — Phase DB seed gap (environmental, no code change)

The cloned `futureuni_p17` / `futureuni_test_p17` lack an active `ServiceLineProfileVersion` for all
four lines, so `getThrottleStatus()` (scoring) throws for the lines without one. Phase 17 handles
this defensively in `getOverview` (a missing throttle falls back to `NORMAL`), but the same gap
makes some **pre-existing** scoring integration tests fail (e.g.
`scoring/qualify.integration.test.ts`, DISQUALIFIED vs NURTURE — capacity/profile dependent). An
owner-run `pnpm db:reset` on the phase databases (Prisma blocks agent-run resets) restores the full
seed and clears those failures. Not caused by Phase 17.

## Schema

**No schema changes.** The performance budget (M17-AC3) was met on 50,000 leads without a rollup
table (timings in `SUMMARY.md`), so no rollup migration is requested.

## Design note (for review, not a change)

Line-scoped AI cost is computed directly from `AiCall` (joined to `Lead` for the service line) in
`analytics/queries/cost.repo.ts`, rather than via `@/platform/ai` `getUsageSummary`, because that
service is gated on `platform.aiUsage.read` (ADMIN-only) and has no service-line dimension. This is
a different, line-scoped aggregation, not a re-implementation of its logic.
