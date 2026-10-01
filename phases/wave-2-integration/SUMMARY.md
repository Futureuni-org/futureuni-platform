# Wave 2 integration (Batch B3): Summary

| | |
|---|---|
| Scope | Merge Phases 8 (sourcing) and 10 (audits) into `main`; Part C3 Wave 2 integration for Phases 07–10 |
| Date | 2026-10-01 |
| Prompt | `docs/prompts/wave-2/wave-2-prep-and-merge.md` Part C3 |
| Verification | `pnpm check`: **Pass** (lint, typecheck, tests, build; tests serialized — see §Parallelism). `pnpm evals`: **blocked** by a pre-existing eval-runner crash (see §Known issues). `pnpm test:e2e`: not run (no Wave 2 UI). |

## What was done

Phases 7 and 9 were already merged and integrated in Batch B2. This session finished Batch B3 and
the Wave 2 integration:

1. **Committed** the two parallel phases on their branches: `phase/08-sourcing` (3e21647) and
   `phase/10-audits` (2a72e00).
2. **Merged into `main`** in the documented order — `phase/08-sourcing` then `phase/10-audits`
   (merge commits), no code conflicts. `pnpm install` reconciled the lockfile after the audit
   browser dependencies (`sharp`, `@vercel/sandbox`, `playwright-core`) plus `fast-xml-parser` from
   sourcing.
3. **Registered Phase 8 and 10 on the acquisition manifest** (`src/modules/acquisition/manifest.ts`),
   applying `phases/08/REQUESTS.md` CR-08-01 and `phases/10/REQUESTS.md` CR-10-01:
   - jobs: `acquisition.sourcing.run`, `acquisition.audits.{lead,batch,refresh}`.
   - settings: `acquisition.sourcing.*` and `acquisition.audits.*`.
   - aiTasks: the two `source-*` tasks and the six `audit-*` tasks.
   - `dynamicSchedules: getSourcingDynamicSchedules` (the one dynamic-schedule provider).
   - `notificationTypes: [sourcing.run-completed]`.
   `pnpm registry:gen` regenerates cleanly; `getAllJobs()` / `getAllAiTasks()` list the new entries.
4. **Seams:** every Wave 2 seam was already satisfied by real code (Phases 7 and 9 merged in B2), so
   Phases 8 and 10 wrote **no** stand-ins. `grep -r "SEAM:" src` returns nothing.
5. **Pre-existing lint fix:** committed the one-line removal of the unused `DefineTask` import in
   `src/platform/ai/registry.ts` (it rode in with Phase 8's merge), resolving CR-08-07 / CR-10-06.
6. **Fixed a manifest ↔ registry import cycle** the wiring exposed: `src/modules/acquisition/sourcing/tasks.ts`
   now imports `defineTask` from `@/platform/ai/define` and `registerTask` from `@/platform/ai/registry`
   (not the booting `@/platform/ai` barrel), and the manifest imports the area registration arrays
   from leaf files (`./sourcing/jobs`, `./audits/tasks`, …) rather than the barrels, so loading the
   manifest never boots the AI task registry mid-initialization (TDZ on `validated`).

## Parallelism (resolved the pre-existing test-isolation defect)

`pnpm check` ran red at first on three `tests/integration/batch-b1-acceptance.test.ts` admin-count
tests. Root cause (pre-existing, surfaced by the new test files shifting vitest's schedule): several
service tests commit a globally-visible active admin, and b1's "last active admin" assertions read
global state, so file-parallel execution let them see each other's committed rows. Fixed in
`vitest.config.ts` with `fileParallelism: false` (files run one at a time; tests within a file
already run in order). `pnpm check` is green with it. This addresses CR-08-09. A lighter,
longer-term option (isolate only the admin-sensitive integration tests) is left to Phase 20/Phase 1.

## Change requests applied / rejected

- **Applied:** CR-08-01 and CR-10-01 (manifest wiring); CR-08-07 / CR-10-06 (registry.ts lint fix);
  seams recorded real (CR-08-03, Phase 10 seams note). Dependencies (`fast-xml-parser`, `sharp`,
  `@vercel/sandbox`, `playwright-core`) are in `package.json` and installed.
- **No-op / confirmed:** CR-08-04/05 (no schema or contract change needed — adapter IDs already in
  the contract, audit models already in the schema); CR-10-03 (`platform.retention.screenshotsDays`
  default 90 read defensively; left as the default).
- **Deferred (see Known issues):** CR-08-02 / C3 step 3 (flip optional references to required and run
  `pnpm evals`); C3 step 6 (combined `tests/integration/wave-2-pipeline.test.ts`).
- **Rejected:** none.

## Known issues / deferred

1. **`pnpm evals` is blocked by a pre-existing eval-runner crash** — `evals/_runner/cli.ts` under
   `tsx --conditions=react-server` throws `_react.default.createContext is not a function` at startup,
   before any task runs. It reproduces for a pre-Wave-2 task (`acquisition.enrich-pick-contact`), and
   no sourcing/audits/browser module uses `createContext`, so it is a platform tooling defect (owner:
   Phase 5 / Phase 1), **not** introduced by Phase 8 or 10. The eval **content** (cases + mock
   fixtures) exists and is manifest-registered for every acquisition task; it will run once the
   runner is fixed. The Wave 2 AI-task references remain `optional: true` (the Phase 7 reference files
   exist on `main`, so behaviour is unchanged); flip them to required when the runner can verify them.
2. **Combined `tests/integration/wave-2-pipeline.test.ts` (C3 step 6) not written this session.** Each
   phase's own integration tests pass against the real test DB with mocks and cover its leg
   (sourcing: `runner.integration.test.ts`; enrichment: `pipeline.test.ts`; audits: Phase 10's
   suite), and the seams are verified connected. The combined 4-lines × 2-markets
   search→enrich→audit test is a deliberate follow-up (drive `enrichLead` and `runAudits` per lead
   with seeded profiles). Recommended before Wave 3 starts.

## How to verify

- `pnpm check` (serialized tests) — green.
- `node scripts/ownership/check.mjs` — ownership map intact (integration edits are on `main`).
- Worktrees not yet removed: run `pnpm phase remove 08` and `pnpm phase remove 10` when ready (drops
  the phase databases and deletes the merged branches).
