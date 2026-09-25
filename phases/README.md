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
pnpm phase remove <nn>          # removes the worktree and drops the phase databases, after confirmation
```

A sequential phase runs on a branch in the main folder: `git checkout main && git pull && git checkout -b phase/<nn>-<slug>`.

## Merge procedure (every batch and wave)

Run this on `main`. The ownership guard allows every edit there.

1. **Merge each branch** into `main`, in the batch's merge order. After each merge, run `pnpm install && pnpm registry:gen && pnpm check`. If a lockfile conflicts, delete `pnpm-lock.yaml` and reinstall.
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

## Where things are

- Phase prompts: `docs/prompts/` (`wave-N/` subfolders), `docs/prompts/RUN-GUIDE.md`
- Specs: `docs/specs/`. Contracts: `docs/contracts/`. Decisions: `docs/decisions.md`. Integrations: `docs/integrations.md`
- Rules: `.claude/project-rules.md`. Ownership: `CLAUDE.md` (and `scripts/ownership/ownership.json` from Phase 1)
- Summary template: `phases/SUMMARY_TEMPLATE.md`
