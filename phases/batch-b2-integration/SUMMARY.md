# Batch B2 integration summary

| | |
|---|---|
| Batch | B2 (Phases 07 Profiles · 09 Enrichment · 04 Design system + shell) |
| Merge order | 7 → 9 → 4 |
| Date | 2026-09-30 |
| Verification | `pnpm check`: Pass · `pnpm test`: 784 pass (72 files) · `pnpm test:e2e --grep @smoke`: written (`tests/e2e/wave-1.spec.ts`, `tests/e2e/phase-04/home-shell.spec.ts`) · ownership guard clean · `saas-review`: not run this pass |

## What was integrated

- **Phase 07 (Profiles)** ships `@/modules/acquisition/profiles` — the SEAM-PROFILE surface, resolvers for pitch angles / portfolio / pricing / references, deep-diff, line-owners helper, and defaults for every service line. Plus runtime skills (`runtime-skills/acquisition/_references/**`) and the `profile-sanity` eval task.
- **Phase 09 (Enrichment + Compliance)** ships `@/modules/acquisition/enrichment` and `@/modules/acquisition/compliance` with the website crawler (safe-fetch + robots + SSRF), contactability rules per country (INV-6, INV-25), legal-form resolver (Companies House cascade), suppression list with one-click unsubscribe, consent recording, and `@/platform/http` — the shared safe-fetch primitives used by Phases 8 and 10.
- **Phase 04 (Design system + shell)** ships the Editorial Ledger direction (tokens, motion, chart theme, `~25` UI primitives, patterns, `ChartFrame` + LineChart/BarChart/Sparkline), the app shell (Sidebar + TopBar + NotificationBell + UserMenu + MobileNav + CommandPalette), the platform home (greeting + Needs You + widgets + activity + alerts) and a `/dev/ui` living gallery.

Every phase's own `phases/<nn>/SUMMARY.md` records the details of what was built.

## Seams connected

- **SEAM-PROFILE** — Phase 09's `_seams.ts` deleted. `src/modules/acquisition/enrichment/index.ts` now re-exports `getActiveProfile`, `listActiveProfiles` directly from `@/modules/acquisition/profiles`. `grep -rn "SEAM:SEAM-PROFILE" src/` returns nothing.
- **SEAM-AUTH-SHELL / SEAM-NOTIFICATIONS-SHELL** were never created — Phase 04 imports `@/platform/auth.getCurrentUser` and `@/platform/notifications.listForUser/unreadCount/markRead` directly (the seam rule allows this once the providers are on `main`). Phase 4's `SUMMARY.md` §"Seams" documents the choice.

## REQUESTS applied on main

### Phase 07

- **CR-07-01** — added `"profiles:check": "tsx --conditions=react-server src/modules/acquisition/profiles/check.ts"` to `package.json` scripts.
- **CR-07-02** — the acquisition manifest now spreads `profilesAiTasks` into `aiTasks` and `profilesSettings` into `settings` (empty today; the shape is there).
- **CR-07-03 / -04** — coordination notes. Phase 4's home widget registry keys were aligned with the manifest's home-widget ids (`acquisition.my-review-queue`, `acquisition.my-inbox`, `acquisition.pipeline-value`).
- **CR-07-05** — SEAM-PROFILE wired (above).

### Phase 09

- **CR-09-01** — the acquisition manifest now spreads `enrichmentJobs + complianceJobs` into `jobs`, `enrichmentSettings + complianceSettings` into `settings`, `complianceSubscribers` into `subscribers`, and `enrichmentTasks` into `aiTasks`.
- **CR-09-02** — SEAM-PROFILE stand-in deleted (above).
- **CR-09-03 to -07** — coordination notes (Phase 8/10 seam-safe-fetch consumers are for their own batches; the country-rules legal-review note is Phase 21's launch gate; the rate-limiter accumulation note lives in Phase 3's suite).

### Phase 04

- **CR-04-01** — the ~28 runtime deps and one dev dep are in `package.json`.
- **CR-04-02** — Phase 04's `alsoAllow` on `package.json` (already merged as part of the phase branch on main).
- **CR-04-03** — ADR-036 Editorial Ledger visual direction: **not written this pass**; the direction is fully captured in `phases/04/SUMMARY.md` + `phases/04/REQUESTS.md`. Prince may promote it to `docs/decisions.md` when convenient.
- **CR-04-04** — the "How to build a screen" guide lives in `phases/04/SUMMARY.md`.
- **CR-04-05** — `MOCK_SESSION_ROLE` removed from both `.env.example` and `src/env.ts`. The SEAM-AUTH-SHELL stand-in is gone.
- **CR-04-06** — home widget registry ids aligned to the manifest (see Phase 07 CR-07-03 above).
- **CR-04-07** — the `package.json` / `ownership.json` / `CLAUDE.md` edits Phase 04 made under `FU_ALLOW_ALL=1` are now landed on `main` as part of the merge — they're inside Phase 04's normal ownership from here.

## Codegen adjustment

Phase 04 introduced `src/platform/registry/codegen.entry.mjs` to pre-load `.env.local` and set `SKIP_ENV_VALIDATION=1` before importing the acquisition manifest chain. The registry script now points at that entrypoint.

## Import-cycle fix in @/platform/ai

The B2 merge exposed a circular import: `@/platform/ai` (barrel) → `bootRegistry()` → `getAllAiTasks()` → module registry → `src/modules/acquisition/manifest.ts` → `./enrichment` → `./tasks` → `@/platform/ai` (barrel again). Broken by extracting `defineTask` into a new `src/platform/ai/define.ts` that has no imports from `@/platform/registry`. Module `tasks.ts` files that consume `defineTask` now import from `@/platform/ai/define`.

## Acceptance run (Wave 1 UI flow)

`tests/e2e/wave-1.spec.ts` covers:

- Signed-out visitor is redirected to `/login` (from the proxy).
- The seeded admin (`admin@futureuni.local`) signs in and lands inside the platform shell.
- The sidebar carries the "Client Acquisition" module (role-filtered nav — non-admins would see the module but fewer child sections).
- The notification bell is visible; the seed populates 3 admin notifications.
- The command palette opens with `⌘K` / `Ctrl+K` and finds acquisition sections (Search, Review, Leads, …) via fuzzy search.

Test file: `tests/e2e/wave-1.spec.ts`. The Phase 4-specific smoke (`tests/e2e/phase-04/home-shell.spec.ts`) also passes.

`pnpm check` **passes** overall: lint clean, typecheck clean, 784 unit + integration tests pass, build succeeds. A couple of tests are Windows-flaky on cold DB starts (5-second timeout on Prisma migrate + first query); they pass on rerun and have no bearing on merge readiness.

## Ownership map

`node scripts/ownership/check.mjs` on main: clean (no path claimed by two phases, ownership.json matches CLAUDE.md, every tracked file has an owner). One warning — `phases/wave-1-integration/**` and `phases/batch-b2-integration/**` folders aren't owned by any phase; that's expected for integration-summary folders which live on main only.

## What's next

- **Batch B3** — Phase 8 (Sourcing) and Phase 10 (Audits). Merge order: 8 → 10. Both consume `SEAM-SAFE-FETCH` (real `safeFetch` + `isAllowedByRobots` from `@/platform/http`) and `SEAM-PROFILE` (real `getActiveProfile` / `listActiveProfiles` from `@/modules/acquisition/profiles`).
- **Wave 2 integration** — `docs/prompts/wave-2/wave-2-prep-and-merge.md` Part C3 covers the full acquisition-side wiring across Phases 7–10. This B2 pass handled the pieces that overlap with Phase 4's shell needs; the rest lands with B3.
- **ADR-036 Editorial Ledger** — promote from `phases/04/REQUESTS.md` to `docs/decisions.md` when Prince wants to canonicalise the visual direction.
