# Wave 1: Prep and Merge Guide

Wave 1 has four phases that run in parallel: **3 Auth and team**, **4 Design system and shell**, **5 AI service** and **6 Jobs, notifications, audit log, settings, credentials**. This file covers the short steps **before** you start them and **after** they all finish.

---

## Part A: Before starting Wave 1 (5 minutes, on `main`)

Phases 0–2 must be merged, with their `REQUESTS.md` files applied.

### A1. Add the Wave 1 paths to the ownership map

Open Claude Code on `main`. The ownership guard allows every edit on `main`. Say:

> "Update scripts/ownership/ownership.json and the CLAUDE.md ownership table with the Wave 1 additions listed in docs/prompts/wave-1-prep-and-merge.md, Part A1. Then run the ownership duplicate check."

| Phase | Add to `owns` |
|---|---|
| 03 | `src/proxy.ts` (or `src/middleware.ts`, whichever the installed Next.js version uses), `src/app/api/auth/**`, `src/platform/auth/seed.ts` |
| 04 | `src/lib/chart-theme.ts`, `src/components/patterns/**`, `src/components/charts/**`, `src/app/(platform)/dev/**`, `src/app/(platform)/home/**` (if used), `src/app/layout.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx` (transferred from Phase 1 for restyling) |
| 05 | `evals/**`, `runtime-skills/_shared/**` |
| 06 | `src/workflows/_platform/**` (or wherever Vercel Workflow expects workflow files; the Phase 6 plan confirms this), `src/app/api/notifications/**`, `src/emails/**` |

### A2. Put the prompts in place

Copy these files into `docs/prompts/`:

- `phase-03-auth.md`
- `phase-04-design-system.md`
- `phase-05-ai-service.md`
- `phase-06-platform-services.md`
- this file

Commit them to `main`.

### A3. Start four terminals

```bash
pnpm phase start 03 auth
pnpm phase start 04 design-system
pnpm phase start 05 ai-service
pnpm phase start 06 platform-services
```

In each new worktree folder, open Claude Code at maximum effort and in plan mode, then say:

> "Read docs/prompts/phase-0N-….md and execute it. Plan first."

Phase 4 will show you two visual directions in its plan. Pick one before approving.

---

## Part B: The seams (how parallel phases connect)

Each Wave 1 phase needs a few things another phase is building at the same time. Instead of waiting, each phase:

- builds a **temporary stand-in** in its own folder, marked with a `// SEAM:<ID>` comment
- writes the **exact wiring change** in its `REQUESTS.md` under the same ID

At merge, every seam is connected.

| Seam ID | Stand-in lives in | Real implementation comes from | What gets wired |
|---|---|---|---|
| `SEAM-AUTH-SHELL` | Phase 4: `src/components/shell/session.ts` | Phase 3: `@/platform/auth` (`getCurrentUser`, `can`) | The shell and platform home use the real session and permissions. `(platform)/layout.tsx` redirects to `/login` when signed out. |
| `SEAM-AUTH-EMAIL` | Phase 3: `src/platform/auth/_seams.ts` (`sendAuthEmail`) | Phase 6: `@/platform/notifications` (`sendEmail` and templates) | Invite, verification and password-reset emails go through the notification email adapter. |
| `SEAM-AUDIT` | Phases 3 and 5: `_seams.ts` (`recordAudit`) | Phase 6: `@/platform/audit-log` (`audit.record`) | Role changes, invites, deactivations, prompt-version changes and quota changes are written through the shared audit helper. |
| `SEAM-PERMISSION` | Phases 5 and 6: `_seams.ts` (`assertCan`) | Phase 3: `@/platform/auth` (`assertCan`) | Settings, credentials and AI admin actions use the real permission map. |
| `SEAM-AI-CREDENTIALS` | Phase 5: `src/platform/ai/_seams.ts` (`getProviderKey`) | Phase 6: `@/platform/credentials` (`getCredential`) | The Anthropic key is read from the encrypted vault first, then falls back to the env variable. |
| `SEAM-NOTIFICATIONS-SHELL` | Phase 4: `src/components/shell/notifications-source.ts` | Phase 6: `@/platform/notifications` (`listForUser`, `unreadCount`, `markRead`) | The shell's notification bell shows real data. |
| `SEAM-SETTINGS-AI` | Phase 5: `_seams.ts` (`getAiSettings`) | Phase 6: `@/platform/settings` (`getSetting`) | Model choice, quotas and budget caps are read from the settings store. |

**Rules:**

- A stand-in must match the real signature exactly. The signatures are fixed in each phase prompt.
- Stand-ins work in mock mode, so every phase runs and tests on its own.
- No phase imports another Wave 1 phase's code before merge.

---

## Part C: After all four phases finish

### C1. Check each phase

In each worktree run `pnpm phase finish <nn>`. It confirms `SUMMARY.md` exists and `pnpm check` passes.

### C2. Merge in this order

Merge into `main`, in this order: **6 → 3 → 5 → 4**. Phase 6 first, because others wire into it; Phase 4 last, because it's the most visual and the easiest to check after the others are in.

After each merge:

1. `pnpm install`
2. `pnpm registry:gen`
3. `pnpm db:migrate`, only if a schema request was approved
4. `pnpm check`

Resolve lockfile conflicts by deleting `pnpm-lock.yaml` and running `pnpm install`.

### C3. The Wave 1 integration session

Open Claude Code on `main` and say:

> "Read docs/prompts/wave-1-prep-and-merge.md Part C3 and do it."

This session must do the following, in order:

1. Read `phases/03..06/SUMMARY.md` and `REQUESTS.md`.
2. **Connect every seam** in the Part B table:
   - replace each stand-in with the real call
   - delete the stand-in
   - confirm no `SEAM:` markers remain (`grep -r "SEAM:" src` returns nothing)
3. **Apply the remaining change requests.**
   - Schema changes are made as a new Prisma migration.
   - Contract changes, and updates to `data-model.md`, `CLAUDE.md` and `project-rules.md`, are made as requested.
   - List any request you **reject**, with the reason.
4. **Register the platform jobs** from Phase 6 in `core-manifest.ts`, and confirm `getCronSchedules()` includes them.
5. **Run the Wave 1 acceptance flow** by hand, with Playwright MCP, and then as a Playwright test in `tests/e2e/wave-1.spec.ts`:
   - sign in as the seeded admin
   - land on the platform home inside the real shell
   - the notification bell shows seeded notifications
   - invite a user and accept the invite from the logged link (mock email)
   - the new user sees only what their role allows
   - an admin saves an integration credential; it's displayed masked
   - a mock AI task runs and appears in the AI usage log
   - a scheduled job runs through the cron dispatcher and appears in the job-run log
   - an audit log entry exists for the role change and for the credential save
6. `pnpm check`, then `pnpm test:e2e`.
7. Run `saas-review` on the integration diff.
8. Write `phases/wave-1-integration/SUMMARY.md`.

**When C3 passes, Wave 1 is done and Wave 2 (Phases 7–10) can start.**
