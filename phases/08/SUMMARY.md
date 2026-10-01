# Phase 08: Sourcing Framework and Adapters: Summary

| | |
|---|---|
| Phase | 08, Sourcing Framework and Adapters |
| Branch | `phase/08-sourcing` |
| Batch / wave | B3 / Wave 2 |
| Date finished | 2026-10-01 |
| Prompt | `docs/prompts/wave-2/phase-08-sourcing.md` |
| Verification | `pnpm check`: lint ✓, typecheck ✓, build ✓, tests ✓ **serialized** (`vitest run --no-file-parallelism` → 825/825, all 41 Phase 8 tests included). Default-parallel `pnpm test` trips 3 pre-existing `batch-b1-acceptance` admin-count tests via a suite parallel-isolation defect Phase 8 only exposes (CR-08-09). · `pnpm test:e2e`: Not run (no UI; Phase 15 builds the screens) · `saas-review`: no open Critical/Major |

## What was built

The complete sourcing engine that finds businesses needing a FUTUREUNI service. `runSearch(spec)`
runs a line's configured source adapters concurrently under per-adapter rate limits and per-run /
per-day budget caps, normalises each result, derives its market and country, checks suppression
early (INV-2), matches or creates the company in the shared directory (INV-10, INV-14), stores a
`Signal` with evidence, and creates or attaches a `NEW` lead with a `LeadEvent` (INV-1) — or records
that the line can't be reopened. It records everything in a `SearchRun`, emits
`sourcing.run.completed`, notifies the actor, and finishes `PARTIAL` if any adapter fails. Nine
adapters are implemented (`google-places`, `jobs-serpapi`, `jobs-adzuna`[disabled], `jobberman`
[disabled], `myjobmag`[disabled-for-live], `youtube-channels`, `apple-app-store`, `csv-import`,
`manual`), each with a real implementation, a realistic mock and a terms-verified README. Saved
searches run on a schedule through a dynamic-schedule provider and skip when the line is at capacity.
Two AI helpers classify job posts and clean messy company records. Meets AC-1.1–1.6, AC-2.x
(`estimateSearchCost`), AC-4.2/4.3, AC-5.x (CSV), AC-6.1/6.2 (manual), and the search-history/stats
services for AC-3.x and Phase 17.

## Files and folders created

| Path | Purpose |
|---|---|
| `M/sourcing/runner.ts` | `runSearch` — the orchestrator |
| `M/sourcing/pipeline.ts` | per-`RawSignal` processing (normalise → market → suppress → dedupe → signal → lead) |
| `M/sourcing/market.ts` | market/country derivation (explicit → phone → address → ccTLD) |
| `M/sourcing/resolve.ts` | spec + profile → concrete adapter invocations |
| `M/sourcing/budget.ts` | per-run budget (run caps + per-provider daily snapshot) |
| `M/sourcing/limiter.ts` | token bucket + `ProviderUsage` daily snapshot + `platformDay` |
| `M/sourcing/cost.ts` | `estimateSearchCost` (US-2) |
| `M/sourcing/sourcing.repo.ts` | all DB access (SearchRun, Signal, Lead, SavedSearch, ProviderUsage) |
| `M/sourcing/csv-import.ts` | CSV import service (mapping, validation, attestation, error report) |
| `M/sourcing/manual.ts` | manual-add service |
| `M/sourcing/saved-search.ts` | saved-search CRUD + run-now (permissioned, audited) |
| `M/sourcing/history.ts` | search-run history + `getSourceStats` |
| `M/sourcing/schedules.ts` | `getSourcingDynamicSchedules` + capacity skip |
| `M/sourcing/jobs.ts`, `settings.ts`, `tasks.ts`, `notifications.ts` | manifest registrations (wired by Phase 19) |
| `M/sourcing/adapters/**` | the 9 adapters (`index.ts` + `mock.ts` + `README.md`), the registry, `types.ts`, `_shared/{provider-http,jobs,empty}.ts`, `csv-import/parse-csv.ts` |
| `runtime-skills/acquisition/source-classify-job-post/`, `source-extract-company/` | AI skill files |
| `evals/acquisition/source-classify-job-post/`, `source-extract-company/` | eval cases (incl. agency, staffing, in-house, injection traps) + mock fixtures |
| `M/sourcing/*.test.ts`, `adapters/**/*.test.ts` | 41 unit + integration tests |

(`M` = `src/modules/acquisition`.)

## Public interfaces other phases can use

```ts
// @/modules/acquisition/sourcing
export function runSearch(rawSpec: unknown, options: RunSearchOptions): Promise<SearchRun>; // acquisition.search.run
export function estimateSearchCost(rawSpec: unknown): Promise<SearchCostEstimate>;          // US-2
export function importCsv(actor: Actor, input: ImportCsvInput): Promise<ImportCsvResult>;   // acquisition.import.run
export function previewCsv(content: string, mapping: ColumnMapping): CsvPreview;
export function addManualLead(actor: Actor, input: ManualLeadInput): Promise<ManualLeadResult>; // acquisition.lead.create
export function createSavedSearch(actor: Actor, input: CreateSavedSearchInput): Promise<SavedSearch>; // acquisition.savedSearch.manage (also update/pause/delete/list/runNow)
export function listSearchRuns(actor: Actor, input): Promise<Page<SearchRun>>;              // acquisition.search.read
export function getSearchRun(actor: Actor, id: string): Promise<SearchRunDetail>;           // acquisition.search.read
export function cancelSearchRun(actor: Actor, id: string): Promise<SearchRun>;              // acquisition.search.run
export function getSourceStats(actor: Actor, input): Promise<SourceStatRow[]>;              // acquisition.search.read
export function listAdapters(): AnySourceAdapter[];                                         // Search panel source list
export const getSourcingDynamicSchedules: DynamicScheduleProvider;                          // cron dispatcher
export const sourcingJobs, sourcingSettings, sourcingTasks, sourcingNotificationTypes;      // manifest registrations
```

- **Job:** `acquisition.sourcing.run` (systemActions `acquisition.search.run`; idempotency key =
  `savedSearchId + slot` for scheduled, `nonce` for manual).
- **Event emitted:** `sourcing.run.completed`; plus `lead.created` and `signal.recorded` per result.
- **Settings:** `acquisition.sourcing.{maxProviderCallsPerRun, maxCostMicrosPerRun,
  providerDailyCostCapMicros, concurrency, maxCsvRows}` (read with a default fallback until wired).
- **Notification type:** `sourcing.run-completed`.
- **AI tasks:** `acquisition.source-classify-job-post`, `acquisition.source-extract-company` (fast
  tier; `registerSourcingTasks()` registers them for tests/evals until the manifest wiring lands).

## Decisions made (and any new ADRs proposed)

- **Capacity skip lives in the job, not the schedule provider**, so the SKIPPED `SearchRun` is
  recorded exactly once per due slot (not every cron tick) and the `capacity.line-full` notice is
  deduped to once per line per day. No ADR needed.
- **Per-second rate limiting is applied at the signal-consumption level** in the runner (a token
  bucket per adapter) — a conservative proxy for the provider call rate; the hard guards are the
  per-run budget and the persisted `ProviderUsage` daily caps.
- **`getActiveProfile` is imported lazily** in the four sourcing modules that use it, to stay out of
  the pre-existing `manifest ↔ profiles` static-import cycle (CR-08-07/CR-08-01). No ADR needed.
- No new ADRs proposed.

## Dependencies added

| Package | Version | Why |
|---|---|---|
| `fast-xml-parser` | ^5 (pnpm add) | Parse the MyJobMag public XML job feeds in the (disabled-for-live) `myjobmag` adapter. |

## Change requests raised

See `phases/08/REQUESTS.md`:
- **CR-08-01** manifest wiring — jobs, settings, aiTasks, notificationTypes and the
  `dynamicSchedules` provider (Phase 8 is the only one).
- **CR-08-02** AI references — flip optional refs to required and run evals.
- **CR-08-03** seams — SEAM-PROFILE and SEAM-SAFE-FETCH used **real** (no wiring needed).
- **CR-08-04** no schema change; **CR-08-05** no contract change.
- **CR-08-06** optional credential `test()` for `google-places`/`serpapi`/`youtube-data`.
- **CR-08-07** keep the pre-existing `ai/registry.ts` unused-import fix; **CR-08-08** confirm
  `.env.example` provider keys.
- **CR-08-09** pre-existing parallel test-isolation defect (b1 admin-count vs committed-admin
  service tests) that Phase 8's added test files expose; needs a `vitest.config.ts` isolation fix at
  integration. Confirmed green serialized (825/825).
- **Rejected:** none.

**Seams:** **SEAM-PROFILE** — real (`@/modules/acquisition/profiles`, Phase 7 merged). **SEAM-SAFE-FETCH**
— real (`@/platform/http`, Phase 9 merged). No stand-ins written; `grep -r "SEAM:" src/modules/acquisition/sourcing` is empty.

## Known limitations

- **Transient-source dedupe (INV-14):** `google-places` stores only the `place_id`, so two Google
  listings of the same business with different `place_id`s create two companies; cross-source
  dedupe by phone/domain happens once a non-transient source adds those fields (enrichment, a job
  post, CSV or manual add). By design.
- **`jobs-adzuna`, `jobberman`, `myjobmag` ship DISABLED** (licence/terms/robots; MyJobMag pending
  written feed confirmation). They never run; `jobs-serpapi` covers Nigerian job inventory.
- **Evals** are written but run at integration (the tasks aren't on the manifest in this worktree);
  mock fixtures carry per-case `byHash` outputs so mock-mode runs are deterministic.
- Credential `test()` implementations are not added yet (CR-08-06, optional).
- The YouTube `gone_quiet` check needs one extra `playlistItems.list` per channel for the latest
  upload date; per-query daily caching is a noted follow-up (README).

## How to test it

- `pnpm check` (lint, typecheck, unit + integration tests, build) — all pass.
- Sourcing tests only: `pnpm exec vitest run src/modules/acquisition/sourcing` (41 tests, mock
  adapters, real test DB).
- The integration tests create an `ADMIN` and a `VIDEO_EDITING` `SERVICE_LEAD` via the factories and
  exercise: a NIGERIA Web search (companies + signals + `NEW` leads + `LeadEvent`), re-run dedupe,
  out-of-market drop, suppression, no-reopen, cross-line hint, a failing adapter → `PARTIAL`, a
  `FORBIDDEN` cross-line search, manual add (owner + `manual:<userId>` source), a suppressed manual
  phone, and a capacity skip (`GRAPHIC_DESIGN` has no team, so it is at capacity).
- Evals (at integration, once wired): `pnpm evals acquisition.source-classify-job-post` and
  `pnpm evals acquisition.source-extract-company`.
