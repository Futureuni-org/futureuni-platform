# Wave 3 integration (batch B5): Summary

| | |
|---|---|
| Batch / wave | B5 / Wave 3 (inbox) + Wave 4 (admin, batched here) |
| Date | 2026-10-02 |
| Recipe | `docs/prompts/wave-3/wave-3-prep-and-merge.md` Part C3 (full, incl. all reply branches); `phases/README.md` B5 row |
| Merged | `phase/13-inbox` → `phase/18-admin-settings` (merge order 13 → 18) |
| Verification | typecheck: Pass · lint (changed files): Pass · `tests/integration/wave-3-flow.test.ts`: Pass (8) · inbox suites: Pass (46) · notifications + registry suites: Pass · **full `pnpm test` + `pnpm build`: not run to completion** (host memory + the shared test DB needs a reset — see below) · `saas-review`: Phase 13 clean; Phase 18 clean (self-reviewed in their sessions) |

## What was done

1. **Merged Phase 13 (reply inbox)** into `main` (`--no-ff`), then **Phase 18 (admin & settings)**. Both ownership `--phase-diff` checks were clean (13: 98 paths; 18: 103 paths, after discarding two incidentally-regenerated `phases/14/samples/*.pdf` the branch did not own). No merge conflicts.
2. **Registered Phase 13 on the acquisition manifest** (`src/modules/acquisition/manifest.ts`): `inboxJobs`, `inboxSchedules`, `inboxSettings`, `inboxAiTasks`, `inboxNotifications` (imported from the leaf files, not the barrel, to avoid the manifest↔registry cycle). `pnpm registry:gen` passes; the ownership duplicate check passes.
3. **Dropped two redundancies discovered at integration** (CR-13-01 reconciliation):
   - `reply.interested` and `reply.needs-action` are already **platform** notification types (`src/platform/notifications/types.ts`) and are routed from `reply.classified` by the Phase 6 notification-router (`src/platform/notifications/router.ts`, same `dedupeKey`). Removed the duplicate declarations from `inbox/notifications.ts` (kept the genuinely-new `reply.sla-warning`, `reply.sla-breached`, `nurture.follow-up-due`).
   - Deleted the redundant `inbox/subscribers.ts` (its `reply.classified` → owner mapping is exactly what the platform router already does) and removed it from the manifest and barrel.
   - Fixed `inbox/tasks.ts` to import `registerTask` from `@/platform/ai/registry` (not the `@/platform/ai` barrel, which boots the registry) — the barrel import formed the manifest↔registry cycle that broke the registry/notifications suites; mirrors `pipeline/tasks.ts`.
4. **Seams:** `grep -r "SEAM:" src` shows only `SEAM-LINE-CONTEXT` (Phase 18's stub, left until B6 per instruction). All of Phase 13's consumed seams were already real (12 & 14 merged). Phase 18's REQUESTS are all deferred (service-gap interim repos stay; promote-candidates later; nuqs not needed), so nothing else was applied.
5. **Flow test:** extended `tests/integration/wave-3-flow.test.ts` with a reply-branches suite exercising Phase 13 on the wired engine: INTERESTED (stop + REPLIED + SLA), UNSUBSCRIBE (suppress + company stop + SUPPRESSED), OUT_OF_OFFICE (pause), BOUNCE (suppress + stop + contact INVALID), NOT_NOW (→ NURTURE + nextActionAt), WRONG_PERSON (verified referral contact), and one-click unsubscribe without a session. All 8 tests pass (the B4 funnel + 7 reply branches).

## Verification detail and open items

- **typecheck** (whole project) and **lint** (all changed files) pass. The inbox suites (46), the extended flow test (8), and the notifications + registry suites pass.
- **`pnpm build` and the full `pnpm test` were not completed here.** `pnpm build` (Next production build) repeatedly hit host **memory pressure** in this environment (the same limitation Phases 13 and 18 recorded). The full `pnpm test` additionally needs a **freshly reset `futureuni_test`**: running integration suites against the shared DB left residual users/admins.
- **Known failing tests, all unrelated to the merged code (to re-confirm on a reset DB):**
  - `tests/integration/batch-b1-acceptance.test.ts` → "core-manifest exposes platform jobs and schedules" — **pre-existing test-design issue**: it checks every module's cron schedule (including Phase 11's `acquisition.scoring.batch`) against **platform-only** job names, so any acquisition schedule fails it regardless of the inbox change.
  - `batch-b1-acceptance` invite / last-admin ×2 / saveCredential — **shared-DB state**: these depend on the seeded admin count, which the integration runs perturbed. Expected to pass on a reset `futureuni_test`.
  - No failure touches `src/modules/acquisition/inbox/**`, `src/modules/acquisition/ui/settings/**`, `src/app/(platform)/admin/**` or the manifest wiring.

## To finish the gate (healthy environment)

Run with a fresh DB and enough memory:

```
! pnpm db:reset        # Prisma blocks agent-initiated reset; run it yourself
pnpm check             # lint + typecheck + full test + build
pnpm test:e2e          # Phase 18 auth/admin e2e + Phase 3 auth e2e
```

Then confirm `batch-b1-acceptance` passes except the pre-existing schedule-vs-platform-jobs assertion (a separate Wave-1 test fix), and that `pnpm build` is green.

## Follow-ups carried forward

- `SEAM-LINE-CONTEXT` (Phase 18) wired at **B6** from `@/modules/acquisition/ui/shell`.
- Phase 18's service-gap interim repos (`CR-18-GAP-*`) replaced by real services as each owning phase lands.
- Phase 18 generic admin primitives are promote-candidates for `@/components/ui` / `patterns`.
