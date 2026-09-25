# FUTUREUNI Platform: Run Guide (3 terminals max)

This guide tells you **exactly what to run, in what order, and in how many terminals**. It replaces the "4 in parallel" wave layout for execution: **never more than 3 terminals run at once.** The phase prompts themselves are unchanged.

---

## 1. Put the prompts in the codebase (once)

Create the repository folder (for example `futureuni-platform/`) and copy your ROADMAP folder into it as `docs/prompts/`. **Rename the wave folders to have no spaces** (`WAVE 1` → `wave-1`), because spaces break terminal commands.

```
futureuni-platform/
  docs/
    brand/                         ← put the FUTUREUNI logo files here
    prompts/
      RUN-GUIDE.md                 ← this file
      futureuni-platform-build-roadmap.md
      phase-00-requirements.md
      phase-01-scaffold.md
      phase-02-core-schema.md
      wave-1/  wave-1-prep-and-merge.md, phase-03-auth.md, phase-04-design-system.md, phase-05-ai-service.md, phase-06-platform-services.md
      wave-2/  wave-2-prep-and-merge.md, phase-07-profiles.md, phase-08-sourcing.md, phase-09-enrichment.md, phase-10-audits.md
      wave-3/  wave-3-prep-and-merge.md, phase-11-scoring.md, phase-12-outreach.md, phase-13-inbox.md, phase-14-pipeline.md
      wave-4/  wave-4-prep-and-merge.md, phase-15-module-shell.md, phase-16-leads-pipeline-inbox.md, phase-17-analytics.md, phase-18-admin-settings.md
      wave-5/  phase-19-integration.md, phase-20-hardening.md, phase-21-go-live.md, adding-a-new-module.md
```

The prompts mention paths like `docs/prompts/wave-1-prep-and-merge.md`. Phase 0 adds a rule to `CLAUDE.md` so Claude Code finds any prompt file by its name anywhere under `docs/prompts/`.

**After Phase 1 has created the git repository, commit `docs/prompts/` to `main`.** Parallel worktrees are created from `main`, so they only see prompts that are committed there.

---

## 2. How to open a phase terminal (keeps the laptop light)

Use **one VS Code window**, with its integrated terminal split into up to 3 panes. Don't open a separate VS Code window per phase; that uses a lot more memory.

- **A sequential phase** runs in the main repository folder:

  ```bash
  git checkout main && git pull
  git checkout -b phase/NN-slug
  claude
  ```

- **A parallel phase** gets its own worktree, created from the main repository folder:

  ```bash
  pnpm phase start NN slug          # creates ../futureuni-platform-NN-slug with its own DB and port
  cd ../futureuni-platform-NN-slug
  claude
  ```

In every Claude Code session: choose Opus at maximum effort, switch to **plan mode**, paste the one-line command given below, review the plan, approve it, and let it build. When it finishes, it writes `phases/NN/SUMMARY.md` and stops. **It never merges on its own.**

---

## 3. The batches

| Batch | Terminals | Phases | Starts after |
|---|---|---|---|
| **B0** | 1 (sequential) | 0 → 1 → 2 | — |
| **B1** | 3 | 3 Auth · 5 AI service · 6 Platform services | B0 merged |
| **B2** | 3 | 4 Design system · 7 Profiles · 9 Enrichment | B1 merged and integrated |
| **B3** | 2 | 8 Sourcing · 10 Audits | B2 merged |
| **B4** | 3 | 11 Scoring · 12 Outreach · 14 Pipeline | B3 merged and Wave 2 integrated |
| **B5** | 2 | 13 Inbox · 18 Admin and settings | B4 merged and integrated |
| **B6** | 3 | 15 Module shell · 16 Leads, pipeline, inbox · 17 Analytics | B5 merged and Wave 3 integrated |
| **B7** | 1 (sequential) | 19 → 20 → 21 | B6 merged and Wave 4 integrated |

**Why this order works:**

- **Phase 4** (UI) moved to B2, so it uses the real login and notifications instead of stand-ins.
- **Phases 8 and 10** run after 7 and 9, so they use the real profiles and the real safe web fetcher.
- **Phase 13** runs after 12 and 14, so it calls the real sequence, send and booking services.
- **Phase 18** only needs backend services that are already merged by then, so it pairs with 13.
- **Fewer parallel dependencies means fewer stand-ins.** The seam rule in `CLAUDE.md` (added in Phase 0) handles this automatically:
  - if the phase that provides a seam is **already merged** on `main`, the session uses the real code and writes no stand-in
  - if it's running in parallel, the session builds the stand-in exactly as its prompt says

---

## 4. Step by step

### B0: Foundation (1 terminal, one phase after another)

**Phase 0.** In the empty repository folder, with `docs/prompts/` and `docs/brand/` in place:

```
Read docs/prompts/phase-00-requirements.md and execute it. In addition, add a section to CLAUDE.md titled "Running phase prompts" with these rules: (1) Phase prompts live in docs/prompts/ and its wave-N/ subfolders; resolve any docs/prompts/<file> reference by finding that file name anywhere under docs/prompts/. (2) Execution order and parallelism follow docs/prompts/RUN-GUIDE.md (max 3 terminals); record its batch table in phases/README.md alongside the wave table. (3) Seam rule: for every seam in a phase prompt, if the providing phase is already merged on main, call the real implementation directly and write no stand-in; if the providing phase is running in parallel, build the stand-in exactly as specified. Note which seams you stubbed in REQUESTS.md. (4) When a phase finishes, write phases/NN/SUMMARY.md and stop; never commit or merge unless asked. Plan first.
```

When it's done, commit to `main`.

**Phase 1.** On branch `phase/01-scaffold`:

```
Run Phase 1: docs/prompts/phase-01-scaffold.md. Plan first.
```

When it's done, merge into `main` and apply `phases/01/REQUESTS.md`. Then **commit `docs/prompts/` if it isn't committed yet.**

**Phase 2.** On branch `phase/02-core-schema`:

```
Run Phase 2: docs/prompts/phase-02-core-schema.md. Plan first.
```

When it's done, merge into `main` and apply `phases/02/REQUESTS.md`.

---

### B1: Platform core, part 1 (3 terminals)

**Prep (on `main`, 1 terminal):**

```
Apply Part A1 of docs/prompts/wave-1/wave-1-prep-and-merge.md (ownership map additions for phases 03–06), then run the ownership duplicate check and pnpm check.
```

Commit.

**Run in parallel:**

| Terminal | Setup | Command in Claude Code |
|---|---|---|
| 1 | `pnpm phase start 03 auth` | `Run Phase 3: docs/prompts/wave-1/phase-03-auth.md. Plan first.` |
| 2 | `pnpm phase start 05 ai-service` | `Run Phase 5: docs/prompts/wave-1/phase-05-ai-service.md. Plan first.` |
| 3 | `pnpm phase start 06 platform-services` | `Run Phase 6: docs/prompts/wave-1/phase-06-platform-services.md. Plan first.` |

**Merge (on `main`):**

1. In each worktree, run `pnpm phase finish 06`, `pnpm phase finish 03` and `pnpm phase finish 05`.
2. Merge in the order **6 → 3 → 5**. After each one: `pnpm install && pnpm registry:gen && pnpm check`.
3. Integrate:

   ```
   Integrate batch B1. Follow Part C3 of docs/prompts/wave-1/wave-1-prep-and-merge.md, but only for phases 03, 05 and 06: connect SEAM-AUTH-EMAIL, SEAM-AUDIT, SEAM-PERMISSION, SEAM-AI-CREDENTIALS and SEAM-SETTINGS-AI, apply their REQUESTS.md, register the platform jobs in core-manifest.ts, and run the non-UI parts of the acceptance flow as integration tests (invite and accept, role limits, masked credential save, mock AI call logged, scheduled job via cron tick, audit entries). Phase 4 is not built yet; skip shell checks. Write phases/wave-1-integration/SUMMARY.md.
   ```

4. Remove the worktrees: `pnpm phase remove 03`, and the same for 05 and 06.

---

### B2: Design system, profiles and enrichment (3 terminals)

**Prep (on `main`):**

```
Apply Part A1 of docs/prompts/wave-2/wave-2-prep-and-merge.md (ownership map additions for phases 05-narrowing, 07, 08, 09, 10), then run the ownership duplicate check.
```

Commit.

**Run in parallel:**

| Terminal | Setup | Command in Claude Code |
|---|---|---|
| 1 | `pnpm phase start 04 design-system` | `Run Phase 4: docs/prompts/wave-1/phase-04-design-system.md. Phases 3 and 6 are merged, so use @/platform/auth and @/platform/notifications directly (seam rule). Plan first.` |
| 2 | `pnpm phase start 07 profiles` | `Run Phase 7: docs/prompts/wave-2/phase-07-profiles.md. Plan first.` |
| 3 | `pnpm phase start 09 enrichment` | `Run Phase 9: docs/prompts/wave-2/phase-09-enrichment.md. Phase 7 runs in parallel, so stub SEAM-PROFILE. Plan first.` |

Phase 4 pauses to show you **two visual directions**. Pick one before you approve its plan.

**Merge:**

1. Merge in the order **7 → 9 → 4**, running `pnpm install && pnpm registry:gen && pnpm check` after each one.
2. Integrate:

   ```
   Integrate batch B2. Connect SEAM-PROFILE in phase 09's code to the real @/modules/acquisition/profiles, apply phases/04, 07, 09 REQUESTS.md, then finish the Wave 1 acceptance flow from Part C3 of docs/prompts/wave-1/wave-1-prep-and-merge.md including the UI parts (sign in, real shell, notification bell, role-based navigation) as tests/e2e/wave-1.spec.ts. Write phases/batch-b2-integration/SUMMARY.md.
   ```

3. Remove the worktrees.

---

### B3: Sourcing and audits (2 terminals)

| Terminal | Setup | Command in Claude Code |
|---|---|---|
| 1 | `pnpm phase start 08 sourcing` | `Run Phase 8: docs/prompts/wave-2/phase-08-sourcing.md. Phases 7 and 9 are merged, so use the real profiles and @/platform/http (seam rule). Plan first.` |
| 2 | `pnpm phase start 10 audits` | `Run Phase 10: docs/prompts/wave-2/phase-10-audits.md. Phases 7 and 9 are merged, so use the real profiles and @/platform/http (seam rule). Plan first.` |

**Merge:**

1. Merge in the order **8 → 10**.
2. Integrate:

   ```
   Run Part C3 of docs/prompts/wave-2/wave-2-prep-and-merge.md (Wave 2 integration) for phases 07–10.
   ```

3. Remove the worktrees.

---

### B4: Scoring, outreach and pipeline (3 terminals)

**Prep (on `main`):**

```
Apply Parts A1 and A2 of docs/prompts/wave-3/wave-3-prep-and-merge.md, then run the ownership duplicate check and pnpm check.
```

Commit.

| Terminal | Setup | Command in Claude Code |
|---|---|---|
| 1 | `pnpm phase start 11 scoring` | `Run Phase 11: docs/prompts/wave-3/phase-11-scoring.md. Plan first.` |
| 2 | `pnpm phase start 12 outreach` | `Run Phase 12: docs/prompts/wave-3/phase-12-outreach.md. Phases 11 and 14 run in parallel, so stub SEAM-LEAD-BRIEF, SEAM-THROTTLE, SEAM-CROSSSELL and SEAM-BOOKING-LINK. Plan first.` |
| 3 | `pnpm phase start 14 pipeline` | `Run Phase 14: docs/prompts/wave-3/phase-14-pipeline.md. Phases 11 and 12 run in parallel, so stub SEAM-LEAD-BRIEF, SEAM-STOP-SEQUENCE and SEAM-SEND-ONEOFF. Plan first.` |

**Merge:**

1. Merge in the order **11 → 12 → 14**.
2. Integrate:

   ```
   Integrate batch B4. Follow Part C3 of docs/prompts/wave-3/wave-3-prep-and-merge.md steps 1–4 for phases 11, 12 and 14 only: connect every seam between them, register their jobs, schedules, settings, AI tasks and notifications, apply their REQUESTS.md. Phase 13 is not built yet; skip the reply-driven parts of the flow test for now. Write phases/batch-b4-integration/SUMMARY.md.
   ```

3. Remove the worktrees.

---

### B5: Inbox and admin (2 terminals)

**Prep (on `main`):**

```
Apply Part A1 of docs/prompts/wave-4/wave-4-prep-and-merge.md (ownership for phases 15–18), then run the ownership duplicate check.
```

Commit.

| Terminal | Setup | Command in Claude Code |
|---|---|---|
| 1 | `pnpm phase start 13 inbox` | `Run Phase 13: docs/prompts/wave-3/phase-13-inbox.md. Phases 12 and 14 are merged, so use their real services instead of stand-ins (seam rule). Plan first.` |
| 2 | `pnpm phase start 18 admin-settings` | `Run Phase 18: docs/prompts/wave-4/phase-18-admin-settings.md. Phase 15 isn't built yet, so stub SEAM-LINE-CONTEXT. Plan first.` |

**Merge:**

1. Merge in the order **13 → 18**.
2. Integrate:

   ```
   Run Part C3 of docs/prompts/wave-3/wave-3-prep-and-merge.md (full Wave 3 integration and flow test, including all reply branches). Also apply phases/18/REQUESTS.md except SEAM-LINE-CONTEXT, which stays until batch B6.
   ```

3. Remove the worktrees.

---

### B6: Acquisition screens (3 terminals)

| Terminal | Setup | Command in Claude Code |
|---|---|---|
| 1 | `pnpm phase start 15 module-shell` | `Run Phase 15: docs/prompts/wave-4/phase-15-module-shell.md. Plan first.` |
| 2 | `pnpm phase start 16 leads-pipeline-inbox` | `Run Phase 16: docs/prompts/wave-4/phase-16-leads-pipeline-inbox.md. Phase 15 runs in parallel, so stub SEAM-LINE-CONTEXT. Plan first.` |
| 3 | `pnpm phase start 17 analytics` | `Run Phase 17: docs/prompts/wave-4/phase-17-analytics.md. Phase 15 runs in parallel, so stub SEAM-LINE-CONTEXT. Plan first.` |

**Merge:**

1. Merge in the order **15 → 16 → 17**.
2. Integrate:

   ```
   Run Part C3 of docs/prompts/wave-4/wave-4-prep-and-merge.md (full Wave 4 integration), including connecting SEAM-LINE-CONTEXT in phase 18's code.
   ```

3. Remove the worktrees.

---

### B7: Integration, hardening and go-live (1 terminal, one phase after another)

| Phase | Branch | Command in Claude Code |
|---|---|---|
| 19 | `phase/19-integration` | `Run Phase 19: docs/prompts/wave-5/phase-19-integration.md. Plan first.` |
| 20 | `phase/20-hardening` | `Run Phase 20: docs/prompts/wave-5/phase-20-hardening.md. Plan first.` |
| 21 | `phase/21-go-live` | `Run Phase 21: docs/prompts/wave-5/phase-21-go-live.md. Plan first.` |

Merge each phase before starting the next. Phase 21 stops and asks you before every account, purchase, DNS or spending step.

**When Phase 21's launch checklist is complete, the build is done.** For the next tool, follow `docs/prompts/wave-5/adding-a-new-module.md`.

---

## 5. Where you are (progress markers)

| After | You have |
|---|---|
| B1 | Login, AI service, jobs, notifications, settings, credentials |
| B2 | The design system and shell, service-line profiles, enrichment and compliance |
| B3 | The full acquisition engine up to audits |
| B4 | Scoring, outreach and pipeline |
| B5 | Replies and all admin screens: **the engine works end to end** |
| B6 | Every acquisition screen |
| 19 | **Almost there:** everything wired together, tested end to end |
| 21 | **Done:** live in production |

---

## 6. If something goes wrong

- **A phase fails `pnpm check` at merge.** Don't merge it. Go back into its worktree and say: `pnpm check fails with the output below; fix it within this phase's ownership.` Paste the output.
- **The ownership guard blocks an edit the phase really needs.** That's intended. The session writes the change to `REQUESTS.md`, and it gets applied during the batch integration.
- **The laptop is struggling even with 3 terminals.** Stop the dev servers (`Ctrl+C`) in the terminals that aren't running tests right now. Claude Code doesn't need `pnpm dev` running except for the visual checks. You can also run a 3-phase batch as 2 + 1: the seam rule still works, because a phase merged earlier simply uses the real code.
