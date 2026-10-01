# Phase 08 (Sourcing) — change requests

Applied at Wave 2 integration (Part C3 of `docs/prompts/wave-2/wave-2-prep-and-merge.md`), on `main`.
Phase 8 owns `src/modules/acquisition/sourcing/**`, `runtime-skills/acquisition/source-*/**`,
`evals/acquisition/source-*/**`. Everything below is outside those paths.

## CR-08-01 · Register sourcing on the acquisition manifest
**Kind:** manifest wiring (Phase 19 owns `M/manifest.ts`). **What to change at merge:** merge the
sourcing exports into `src/modules/acquisition/manifest.ts`:
- `jobs: [...existing, ...sourcingJobs]` — the `acquisition.sourcing.run` job.
- `settings: [...existing, ...sourcingSettings]` — five `acquisition.sourcing.*` settings.
- `aiTasks: [...existing, ...sourcingTasks]` — `acquisition.source-classify-job-post`,
  `acquisition.source-extract-company`.
- `notificationTypes: [...existing, ...sourcingNotificationTypes]` — `sourcing.run-completed`.
- `dynamicSchedules: [...existing, getSourcingDynamicSchedules]` — **Phase 8 is the only dynamic
  schedule provider.** If the manifest has no `dynamicSchedules` field yet, add it and have the cron
  dispatcher call every provider at tick time (contract `DynamicScheduleProvider`,
  `docs/contracts/jobs.md`). All exported from `@/modules/acquisition/sourcing`.

## CR-08-02 · Make AI references required and run evals
**Kind:** AI references. **What to change at merge:** the two sourcing tasks declare their line and
market references with `optional: true` (the safe wave pattern). The Phase 7 files under
`runtime-skills/acquisition/_references/` are now on `main`, so no change is strictly required; run
`pnpm evals acquisition.source-classify-job-post` and `pnpm evals acquisition.source-extract-company`
once the tasks are on the manifest and confirm they pass (mock mode; live if keys exist).

## CR-08-03 · Seams used real (no stand-ins)
**Kind:** seam wiring. **What to change at merge:** nothing. Phases 7 and 9 were merged in Batch B2,
so per the seam rule this phase calls the real implementations directly and wrote **no** stand-ins:
- **SEAM-PROFILE** → `getActiveProfile`/`listActiveProfiles` from `@/modules/acquisition/profiles`
  (imported lazily to avoid the manifest ↔ profiles load-order cycle — see CR-08-07).
- **SEAM-SAFE-FETCH** → `safeFetch`/`isAllowedByRobots` from `@/platform/http` (used by the MyJobMag
  feed adapter). `grep -r "SEAM:" src/modules/acquisition/sourcing` returns nothing.

## CR-08-04 · No schema change
**Kind:** schema (Phase 2 owns `prisma/**`). **What to change at merge:** nothing. Every model the
runner needs already exists: `SearchRun`, `SavedSearch`, `Signal` (with the `externalRef`
partial-unique dedupe), `Company`/`CompanySourceRef`, `Lead` (the one-open-lead partial unique), and
the daily counter `ProviderUsage`. No counter table or column was needed.

## CR-08-05 · No contract change
**Kind:** contract (Phase 2 owns `src/contracts/**`). **What to change at merge:** nothing. All nine
adapter IDs are already in `src/contracts/source-adapter.ts`; no new `SourceAdapterId` was added.

## CR-08-06 · Credential `test()` for sourcing providers (optional)
**Kind:** coordination note (Phase 6 owns `src/platform/credentials/**`). **What to change at merge
(optional, improves the admin credential screen):** add a real `test()` for the providers this phase
adopts — `google-places` (a minimal Text Search call), `serpapi` (a tiny Google Jobs query),
`youtube-data` (a `search.list` with `maxResults=1`). Not required for sourcing to work; adapters
resolve keys through `resolveProviderKey` and degrade gracefully when a key is absent.

## CR-08-07 · Pre-existing lint fix kept in the working tree
**Kind:** env/working-tree note (Phase 5 owns `src/platform/ai/registry.ts`). **What to change at
merge:** `main` had an uncommitted one-line change removing the unused `DefineTask` type import from
`src/platform/ai/registry.ts`. It was kept in this branch's working tree so `pnpm check` passes
(ESLint `noInlineConfig` forbids disabling the unused-import rule). Commit it (it is Phase 5's and
is a no-op clean-up) or confirm it is already applied on `main`.

## CR-08-08 · .env.example provider keys
**Kind:** env note (Phase 1 owns `.env.example`). **What to change at merge:** confirm
`.env.example` documents `GOOGLE_PLACES_API_KEY`, `SERPAPI_API_KEY`, `YOUTUBE_API_KEY`, and
`ADZUNA_APP_ID`/`ADZUNA_APP_KEY` (already referenced by `@/platform/credentials` `providerEnvKey`).
Add any that are missing. All sourcing providers are optional (mock mode works end to end).

## CR-08-09 · Parallel test-isolation defect exposed by Phase 8 (needs a vitest config fix)
**Kind:** test-infra coordination (Phase 1 owns `vitest.config.ts`; Phase 19 owns
`tests/integration/**`). **What happens:** `tests/integration/batch-b1-acceptance.test.ts` has three
admin-count tests (`changeRole refuses to leave zero active admins`, `deactivateUser refuses to
strip the last active admin`, and the `saveCredential` test that cascades from them) that read the
**global** active-admin count. Several service tests commit an ACTIVE admin for the duration of a
test (`src/platform/credentials/service.test.ts`, `src/modules/acquisition/compliance/contactability.test.ts`).
Under vitest's default file parallelism these can run **concurrently** with b1, so b1 sees more than
one active admin and its "last admin" assertions fail. This is pre-existing; Phase 8 only **exposes**
it by adding test files, which shifts the parallel file schedule. **Evidence:** `pnpm exec vitest run
--no-file-parallelism` passes **825/825** (every Phase 8 test included); the default parallel
`pnpm test` fails only those 3 b1 tests. Phase 8's own 41 tests pass in every arrangement.
**What to change at merge (pick one):** (a) run the admin-sensitive integration tests serially —
e.g. a vitest project/config that sets `fileParallelism: false` (or isolates `tests/integration/**`
and the committed-admin service tests); or (b) scope b1's admin-count setup to deactivate any other
active admins and run that describe serially; or (c) have the committed-admin service tests create
their admin inside a non-committing transaction where the service under test allows it. Phase 8
makes no change here (the files are outside its ownership).

## Rejected: none.

## Notes for later phases
- **Transient-source dedupe (INV-14):** `google-places` never stores a listing's name, address or
  phone, so two Google results for the same business with different `place_id`s create two
  companies. Cross-source dedupe by phone/domain happens once a non-transient source (a job post,
  CSV, manual add, or enrichment crawl) supplies those fields. This is by design.
- **Disabled adapters:** `jobs-adzuna` (licence/contact-ban), `jobberman` (no API; robots/terms ban)
  and `myjobmag` (live use pending written feed confirmation) ship registered as `DISABLED` with a
  `disabledReason`; they never run. `jobs-serpapi` covers Nigerian job inventory in the meantime.
- **Capacity skip** is enforced in the `acquisition.sourcing.run` job (not the schedule provider),
  so the SKIPPED `SearchRun` is recorded exactly once per due slot; the `capacity.line-full`
  notification is deduped to once per line per day.
