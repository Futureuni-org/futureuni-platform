# Phases: waves, batches and merges

The FUTUREUNI Internal Platform is built in **22 phases (0–21)**. The **waves** describe *what* depends on what. The **batches** (from `docs/prompts/RUN-GUIDE.md`) describe *how it's run*, with at most 3 terminals at once. Execution follows the batches (see `CLAUDE.md` §"Running phase prompts").

Every phase reads `CLAUDE.md` first. It ends by writing `phases/<nn>/SUMMARY.md` (from `phases/SUMMARY_TEMPLATE.md`) and, if it needs changes outside its own paths, `phases/<nn>/REQUESTS.md`. Nothing is merged without the owner's go-ahead.

---

## Waves

| Wave | Phases | Mode |
|---|---|---|
| 0 | 0 Requirements · 1 Scaffold · 2 Core schema and registry | Sequential |
| 1 | 3 Auth and team · 4 Design system and shell · 5 AI service · 6 Jobs, notifications, audit log, settings, credentials | Parallel |
| 2 | 7 Profiles and runtime skills · 8 Sourcing · 9 Enrichment and compliance · 10 Audits | Parallel |
| 3 | 11 Scoring and cross-sell · 12 Outreach · 13 Inbox · 14 Pipeline, meetings, proposals | Parallel |
| 4 | 15 Module shell, search, review · 16 Leads, pipeline, inbox screens · 17 Analytics · 18 Admin and settings screens | Parallel |
| 5 | 19 Integration and orchestration · 20 Hardening · 21 Deploy and go-live | Sequential |

## Batches: the execution order (max 3 terminals)

Recorded from `docs/prompts/RUN-GUIDE.md` §3, which is the source; update this table if the guide changes.

| Batch | Terminals | Phases | Starts after | Merge order | Integration |
|---|---|---|---|---|---|
| **B0** | 1 (sequential) | 0 → 1 → 2 | — | each phase into `main` before the next starts | apply each phase's `REQUESTS.md` on `main` |
| **B1** | 3 | 3 Auth · 5 AI service · 6 Platform services | B0 merged | 6 → 3 → 5 | Part C3 of `wave-1-prep-and-merge.md` for 03, 05, 06 only; write `phases/wave-1-integration/SUMMARY.md` |
| **B2** | 3 | 4 Design system · 7 Profiles · 9 Enrichment | B1 merged and integrated | 7 → 9 → 4 | connect SEAM-PROFILE in 09, apply 04/07/09 requests, finish the Wave 1 acceptance flow with UI (`tests/e2e/wave-1.spec.ts`); write `phases/batch-b2-integration/SUMMARY.md` |
| **B3** | 2 | 8 Sourcing · 10 Audits | B2 merged | 8 → 10 | Part C3 of `wave-2-prep-and-merge.md` (Wave 2 integration, 07–10) |
| **B4** | 3 | 11 Scoring · 12 Outreach · 14 Pipeline | B3 merged and Wave 2 integrated | 11 → 12 → 14 | Part C3 steps 1–4 of `wave-3-prep-and-merge.md` for 11, 12, 14 (no reply-driven tests yet); write `phases/batch-b4-integration/SUMMARY.md` |
| **B5** | 2 | 13 Inbox · 18 Admin and settings | B4 merged and integrated | 13 → 18 | full Part C3 of `wave-3-prep-and-merge.md` (all reply branches); apply 18's requests except SEAM-LINE-CONTEXT |
| **B6** | 3 | 15 Module shell · 16 Leads, pipeline, inbox · 17 Analytics | B5 merged and Wave 3 integrated | 15 → 16 → 17 | Part C3 of `wave-4-prep-and-merge.md` (full Wave 4 integration), including SEAM-LINE-CONTEXT in 18's code |
| **B7** | 1 (sequential) | 19 → 20 → 21 | B6 merged and Wave 4 integrated | each phase into `main` before the next starts | — |

Before B1, B2, B4 and B5 there's a short **prep step on `main`** ("Apply Part A1 of …"). The ownership map in `CLAUDE.md` already contains every Part A1 path (ADR-026), so the prep step only **verifies** the entries, runs the ownership duplicate check and runs `pnpm check`. It adds a path only if something is genuinely missing.

## Dependencies and seams

A phase depends on everything merged before its batch. The **seam rule** (`CLAUDE.md` §"Running phase prompts" rule 3) decides, per seam, whether to call the real code or build a stand-in. Seam signatures are fixed in each wave's `wave-N-prep-and-merge.md` Part B.

| Phase | Depends on (merged first) | Runs alongside | Seams it stubs (provider running in parallel) | Seams it uses for real (provider merged) |
|---|---|---|---|---|
| 0 | — | — | — | — |
| 1 | 0 | — | — | — |
| 2 | 0, 1 | — | — | — |
| 3 | 0–2 | 5, 6 | SEAM-AUTH-EMAIL (6), SEAM-AUDIT (6) | — |
| 5 | 0–2 | 3, 6 | SEAM-AI-CREDENTIALS (6), SEAM-SETTINGS-AI (6), SEAM-PERMISSION (3), SEAM-AUDIT (6) | — |
| 6 | 0–2 | 3, 5 | SEAM-PERMISSION (3) | — |
| 4 | 0–3, 5, 6 | 7, 9 | — | SEAM-AUTH-SHELL (3), SEAM-NOTIFICATIONS-SHELL (6) |
| 7 | 0–6 except 4 | 4, 9 | — | — |
| 9 | 0–6 except 4 | 4, 7 | SEAM-PROFILE (7) | — (provides SEAM-SAFE-FETCH) |
| 8 | 0–7, 9 | 10 | — | SEAM-PROFILE (7), SEAM-SAFE-FETCH (9) |
| 10 | 0–7, 9 | 8 | — | SEAM-PROFILE (7), SEAM-SAFE-FETCH (9) |
| 11 | 0–10 | 12, 14 | — | — (provides SEAM-LEAD-BRIEF, SEAM-THROTTLE, SEAM-CROSSSELL) |
| 12 | 0–10 | 11, 14 | SEAM-LEAD-BRIEF, SEAM-THROTTLE, SEAM-CROSSSELL (11), SEAM-BOOKING-LINK (14) | — |
| 14 | 0–10 | 11, 12 | SEAM-LEAD-BRIEF (11), SEAM-STOP-SEQUENCE, SEAM-SEND-ONEOFF (12) | — |
| 13 | 0–12, 14 | 18 | — | SEAM-STOP-SEQUENCE, SEAM-PAUSE-SEQUENCE, SEAM-PROPOSE-ENROLLMENT, SEAM-SEND-ONEOFF, SEAM-RECORD-BOUNCE, SEAM-MAILBOXES (12), SEAM-BOOKING-LINK (14) |
| 18 | 0–12, 14 | 13 | SEAM-LINE-CONTEXT (15) | — |
| 15 | 0–14, 18 | 16, 17 | — | — (provides SEAM-LINE-CONTEXT) |
| 16 | 0–14, 18 | 15, 17 | SEAM-LINE-CONTEXT (15) | — |
| 17 | 0–14, 18 | 15, 16 | SEAM-LINE-CONTEXT (15) | — |
| 19 | 0–18 | — | — | all |
| 20 | 0–19 | — | — | all |
| 21 | 0–20 | — | — | all |

Lead-status transitions are owned per phase. See the allowed-transitions table in `docs/specs/module-acquisition.md` §"Lead lifecycle".

## Worktrees

A parallel phase runs in its own worktree, created from the main repository folder:

```bash
pnpm phase start <nn> <slug>    # ../futureuni-platform-<nn>-<slug>, branch phase/<nn>-<slug>, DB futureuni_p<nn>, PORT 3000+<nn>
pnpm phase list
pnpm phase finish <nn>          # checks SUMMARY.md exists and pnpm check passes; prints the merge steps; never merges
pnpm phase remove <nn> [--yes] [--force]   # removes the worktree, drops the phase databases, deletes the branch if merged; asks first unless --yes
```

Phase databases are cloned with `CREATE DATABASE … TEMPLATE futureuni_dev` (and `futureuni_test`), the SQL behind `createdb -T`. On the build laptop this runs straight against native Postgres on `localhost:5432` (ADR-004). Stop `pnpm dev` and Prisma Studio in the main folder first: Postgres can't copy a template database while another session is connected to it.

A sequential phase runs on a branch in the main folder: `git checkout main && git pull && git checkout -b phase/<nn>-<slug>`.

## Merge procedure (every batch and wave)

Run this on `main`. The ownership guard allows every edit there.

1. **Merge each branch** into `main`, in the batch's merge order. After each merge, run `pnpm install && pnpm registry:gen && pnpm check` and `node scripts/ownership/check.mjs`. If a lockfile conflicts, delete `pnpm-lock.yaml` and reinstall.
2. **Apply every `REQUESTS.md`** from the merged phases:
   - connect each seam and delete its stand-in, then confirm `grep -r "SEAM:" src` returns nothing for the seams connected in this batch
   - schema changes go in as a new Prisma migration
   - update contracts, `docs/specs/*`, `CLAUDE.md` and `.claude/project-rules.md` as requested
   - list every **rejected** request with its reason in the integration summary
3. **Reinstall:** `pnpm install`.
4. **Run migrations:** `pnpm db:migrate` (when a schema request was applied), then `pnpm registry:gen`.
5. **Run lint, typecheck, test and build:** `pnpm check`, plus `pnpm test:e2e` when UI changed. Then run `saas-review` on the integration diff.
6. **Update "Completed phases"** below: the phase number, name, date merged and the merge commit. Write the integration summary named in the batch table.

Then remove the batch's worktrees (`pnpm phase remove <nn>`).

## Completed phases

| Phase | Name | Merged to `main` | Notes |
|---|---|---|---|
| 0 | Requirements pack | 2026-09-25 | Committed directly to `main` (the repository was created in this phase). See `phases/00/SUMMARY.md`. |
| 1 | Scaffold | 2026-09-26 | Merge commit `19ca895` (branch `phase/01-scaffold`); `phases/01/REQUESTS.md` applied, CR-01-11 left open for Phase 21. See `phases/01/SUMMARY.md`. |
| 2 | Core schema, contracts and registry | 2026-09-26 | Merge commit `1debae8` (branch `phase/02-core-schema`); `phases/02/REQUESTS.md` applied (CR-02-07 with its recommended option; CR-02-21 is notes for later phases). `futureuni_dev` needs one `pnpm db:reset` (run by the owner: Prisma asks for consent). See `phases/02/SUMMARY.md`. |
| 3–6 | Auth · AI service · Platform services · (Design system in B2) | 2026-09 | Batch B1/B2. Merge commits in `git log main`; integrations in `phases/wave-1-integration/SUMMARY.md` and `phases/batch-b2-integration/SUMMARY.md`. |
| 7, 9 | Profiles · Enrichment and compliance | 2026-09 | Batch B2. See `phases/batch-b2-integration/SUMMARY.md`. |
| 8 | Sourcing framework and adapters | 2026-10-01 | Batch B3. Merge commit `78f8290` (branch `phase/08-sourcing`); `phases/08/REQUESTS.md` applied at Wave 2 integration. See `phases/08/SUMMARY.md` and `phases/wave-2-integration/SUMMARY.md`. |
| 10 | Audits engine and browser capture | 2026-10-01 | Batch B3. Merge commit `7e239f4` (branch `phase/10-audits`); `phases/10/REQUESTS.md` applied. See `phases/10/SUMMARY.md`. |
| 11 | Scoring, qualification, briefs, cross-sell and capacity throttling | 2026-10-01 | Batch B4. Merge commit `dd414d3` (branch `phase/11-scoring`); `phases/11/REQUESTS.md` applied at B4 integration (no schema/transition requests). See `phases/11/SUMMARY.md`. |
| 12 | Outreach engine | 2026-10-01 | Batch B4. Merge commit `6f9ed2c` (branch `phase/12-outreach`); `phases/12/REQUESTS.md` applied. See `phases/12/SUMMARY.md`. |
| 14 | Pipeline, meetings, proposals and won/lost | 2026-10-01 | Batch B4. Merge commit `cdffb84` (branch `phase/14-pipeline`); `phases/14/REQUESTS.md` applied (`@react-pdf/renderer` added). See `phases/14/SUMMARY.md` and `phases/batch-b4-integration/SUMMARY.md`. |
| 13 | Reply inbox | 2026-10-02 | Batch B5. Branch `phase/13-inbox`; `phases/13/REQUESTS.md` applied at B5 integration (manifest wiring; `reply.interested`/`reply.needs-action` already platform types + routed by Phase 6, so not redeclared; redundant inbox subscriber removed). No schema change. See `phases/13/SUMMARY.md` and `phases/wave-3-integration/SUMMARY.md`. |
| 18 | Admin and settings screens | 2026-10-02 | Batch B5 (Wave 4 phase). Branch `phase/18-admin-settings`; `phases/18/REQUESTS.md` deferred (interim repos stay; `SEAM-LINE-CONTEXT` wired at B6). See `phases/18/SUMMARY.md` and `phases/wave-3-integration/SUMMARY.md`. |
| 15 | Module shell, search and review screens | 2026-10-05 | Batch B6 / Wave 4. Merge commit `cf3cc98` (branch `phase/15-module-shell`); provides the real `SEAM-LINE-CONTEXT` (`@/modules/acquisition/ui/shell`), connected across Phases 16–18 at B6. `resolveLine` hardened against inherited keys at integration. See `phases/15/SUMMARY.md` and `phases/wave-4-integration/SUMMARY.md`. |
| 16 | Leads, pipeline and inbox screens | 2026-10-05 | Batch B6 / Wave 4. Merge commit `79bef01` (branch `phase/16-leads-pipeline-inbox`); `phases/16/REQUESTS.md` applied at B6 (blob private flow, proposal-PDF attachment wiring; shell fixes via Phase 15). See `phases/16/SUMMARY.md` and `phases/wave-4-integration/SUMMARY.md`. |
| 17 | Acquisition analytics | 2026-10-05 | Batch B6 / Wave 4. Merge commit `87d03e6` (branch `phase/17-analytics`); `phases/17/REQUESTS.md` applied at B6 (CR-17-02 manifest registration — jobs, schedule, settings, AI task, notification type). Promotion/cache/overview-insight follow-ups carried forward. See `phases/17/SUMMARY.md` and `phases/wave-4-integration/SUMMARY.md`. |
| 20 | Hardening (feasible subset) | 2026-10-05 | Batch B7 / Wave 5. Merge commit `b510814` (branch `phase/20-hardening`). Security headers/CSP, authorization-coverage gate, constant-time webhook compare, SSRF cases, PII log redaction, global kill-switch banner; `docs/hardening-report.md` (INV traceability matrix + eval-runner root cause) + `docs/cost-model.md`. **Merged with documented gaps:** environment-gated steps (full `pnpm build`/`pnpm test:e2e`, Lighthouse, axe, `pnpm audit`, gitleaks, live-model evals) and feasible follow-up tests (DSR/retention, AI-quota, chaos, red-team) are listed in `docs/hardening-report.md` §7 + `phases/20/SUMMARY.md`. Verified: lint, `tsc`, codegen, the new SEC/COMP tests (23). |
| 19 | Integration and orchestration | 2026-10-05 | Batch B7 / Wave 5. Merge commit `e69c15f` (branch `phase/19-integration`). `phases/19/REQUESTS-INDEX.md` resolves every request across 01–18. Lead-advance workflow + sweeper, final manifest (staggered schedules, consolidated commands, `review-count` badge), real home widgets, `docs/architecture.md` + `docs/schedules.md`, `seed:staging`; fixed a `/api/notifications/stream` auth stand-in. **Merged with documented gaps:** the full e2e suite (Step 6) and the eval-runner fix are outstanding and tracked in `phases/19/SUMMARY.md` §Known limitations (picked up with Phase 20's feasible subset + a follow-up). Verified: lint, `tsc`, codegen, targeted tests; full `pnpm build`/`pnpm test:e2e` not run in-sandbox. |

## Where things are

- Phase prompts: `docs/prompts/` (`wave-N/` subfolders), `docs/prompts/RUN-GUIDE.md`
- Specs: `docs/specs/`. Contracts: `docs/contracts/`. Decisions: `docs/decisions.md`. Integrations: `docs/integrations.md`
- Rules: `.claude/project-rules.md`. Ownership: `CLAUDE.md` (and `scripts/ownership/ownership.json` from Phase 1)
- Summary template: `phases/SUMMARY_TEMPLATE.md`
