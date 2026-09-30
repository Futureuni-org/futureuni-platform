# FUTUREUNI Internal Platform

Next.js 16 agent rules (read before writing Next.js code): @AGENTS.md

## What this repository is

The FUTUREUNI Internal Platform is one Next.js application, one Postgres database, one login and one Vercel deployment. It holds every internal tool FUTUREUNI builds as a **module** under `src/modules/<id>/`. The first module is **Client Acquisition** (`src/modules/acquisition/`). It finds businesses that need web development, UI/UX design, graphic design or video editing, audits them, runs compliant outreach and tracks deals to won or lost. The build runs as 22 phases (0–21). Many of them run in parallel worktrees, so the rules below are contracts, not suggestions.

## Read first (every session, before planning)

1. `.claude/project-rules.md`: rules, brand, permission matrix, invariants (INV-n) and bans. **Rules live only there.**
2. `docs/specs/platform.md`
3. The spec of the module you're working on: `docs/specs/module-acquisition.md`. Add `docs/specs/data-model.md` when you touch data.
4. `docs/contracts/`: the interfaces between parts. Phase 2 turns them into `src/contracts/`.
5. `docs/decisions.md` (ADR-001 onwards) and `docs/integrations.md`
6. `phases/README.md`: waves, batches, dependencies and the "Completed phases" list
7. The `phases/<nn>/SUMMARY.md` of every completed phase

## Phase protocol

- Every phase runs in its own git worktree and branch, named `phase/<nn>-<slug>` (`pnpm phase start <nn> <slug>`). Sequential phases use a branch in the main folder.
- Start in plan mode. Read the read-first list and the phase prompt, produce a plan and wait for approval.
- Touch only the paths your phase owns in the ownership map below. If you need a change anywhere else (the schema, the contracts, another phase's folder, shared config, this file), **don't make it**. Write it to `phases/<nn>/REQUESTS.md` with the exact change and the reason. Requests are applied at merge time.
- You may add npm dependencies with `pnpm add`. List each one, with its reason, in your `SUMMARY.md`. Lockfile conflicts are resolved at merge by reinstalling.
- When finished, write `phases/<nn>/SUMMARY.md` from `phases/SUMMARY_TEMPLATE.md`, run `saas-review` on your whole diff, and fix every Critical and Major finding. Lint, typecheck, tests and build must all pass (`pnpm check`).
- Never commit or merge unless asked.

## Running phase prompts

1. **Where prompts live.** Phase prompts live in `docs/prompts/` and its `wave-N/` subfolders. Resolve any `docs/prompts/<file>` reference by finding that file name anywhere under `docs/prompts/`. For example, `docs/prompts/wave-1-prep-and-merge.md` is `docs/prompts/wave-1/wave-1-prep-and-merge.md`.
2. **Order and parallelism.** Execution order and parallelism follow `docs/prompts/RUN-GUIDE.md`, with at most 3 terminals. Its batch table (B0–B7) is recorded in `phases/README.md` alongside the wave table. Where a prompt's "How to run" header names different parallel partners or a different order, the RUN-GUIDE wins.
3. **Seam rule.** For every seam in a phase prompt (`SEAM-*`):
   - If the providing phase is already merged on `main`, call the real implementation directly and write no stand-in. The provider is merged if it's in the "Completed phases" list in `phases/README.md`, or its merge commit is in `git log main`.
   - If the providing phase is running in parallel, build the stand-in exactly as specified, with its `// SEAM:<ID>` marker.
   - Note which seams you stubbed in `REQUESTS.md`, with each one's wiring change.
4. **Finishing.** When a phase finishes, write `phases/<nn>/SUMMARY.md` and stop. Never commit or merge unless asked.

## Ownership map

Each path has exactly one owner phase. `scripts/ownership/ownership.json` is the machine-readable source of truth, and the ownership guard hook (`scripts/ownership/guard.mjs`) enforces it on `phase/*` branches. Keep it and this table identical: `node scripts/ownership/check.mjs` fails when a path is claimed by two phases, and warns when the two differ, when a tracked file has no owner, or when an owned folder has no README.md. Shell writes don't reach the hook, so `node scripts/ownership/check.mjs --phase-diff` checks a phase branch's whole diff (`pnpm phase finish` and CI run both). Outside a phase branch (on `main`, or during merge and integration work), every edit is allowed.

**Rules**
- Patterns are globs. `(`, `)`, `[` and `]` are literal path characters.
- Where patterns nest, the **most specific pattern wins**. For example, `src/lib/motion.ts` belongs to 4 and the rest of `src/lib/` to 1.
- Always allowed for phase `nn`: `phases/<nn>/**`, `tests/e2e/phase-<nn>/**` and `pnpm-lock.yaml` (dependencies added with `pnpm add`).
- `FU_ALLOW_ALL=1` turns the guard off. Use it only on `main` for merge and integration work, and in Phase 19 while applying change requests (its prompt allows this). List every file changed that way in the summary.
- `A` = `src/app/(platform)/acquisition`. `M` = `src/modules/acquisition`.

| Owner | Paths |
|---|---|
| 0 | `CLAUDE.md`, `.claude/project-rules.md`, `docs/specs/**`, `docs/contracts/**`, `docs/decisions.md`, `docs/integrations.md`, `docs/prompts/**`, `docs/brand/**`, `docs/background/**`, `docs/legal/**`, `docs/owner-inputs/**`, `phases/README.md`, `phases/SUMMARY_TEMPLATE.md`, `.mcp.json`. After Phase 0 these change only on `main`, when a wave or batch is merged. |
| 1 | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `vercel.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc*`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.env.example`, `vitest.config.ts`, `playwright.config.ts`, `docker-compose.yml`, `docker/**`, `.github/**`, `README.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/hooks/**`, `src/env.ts`, `src/env.test.ts`, `src/lib/**`, `src/app/api/health/**`, `scripts/**`, `tests/setup/**`, `public/**` |
| 2 | `prisma/**`, `prisma.config.ts`, `src/generated/**` (generated Prisma client, gitignored), `src/contracts/**`, `src/platform/db/**`, `src/platform/registry/**`, `src/platform/directory/**`, `M/core/**`, `templates/create-module/**`, `tests/factories/**` |
| 3 | `src/platform/auth/**`, `src/platform/team/**`, `src/app/(auth)/**`, `src/app/api/auth/**`, `src/proxy.ts` (or `src/middleware.ts`, whichever the installed Next.js uses) |
| 4 | `src/styles/**`, `src/components/ui/**`, `src/components/patterns/**`, `src/components/charts/**`, `src/components/shell/**`, `src/lib/motion.ts`, `src/lib/chart-theme.ts`, `src/app/layout.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/(platform)/layout.tsx`, `src/app/(platform)/page.tsx`, `src/app/(platform)/loading.tsx`, `src/app/(platform)/error.tsx`, `src/app/(platform)/dev/**`, `src/app/(platform)/home/**`, `public/brand/**` |
| 5 | `src/platform/ai/**`, `runtime-skills/_shared/**`, `runtime-skills/platform/**`, `evals/_runner/**`, `evals/platform/**` |
| 6 | `src/platform/jobs/**`, `src/platform/events/**`, `src/platform/notifications/**`, `src/platform/audit-log/**`, `src/platform/settings/**`, `src/platform/credentials/**`, `src/platform/storage/**`, `src/app/api/cron/**`, `src/app/api/workflows/**`, `src/app/api/notifications/**`, `src/app/api/dev/**`, `src/workflows/_platform/**`, `src/emails/**` |
| 7 | `M/profiles/**`, `runtime-skills/acquisition/_references/**`, `runtime-skills/acquisition/profile-*/**`, `evals/acquisition/profile-*/**`, `evals/acquisition/profiles/**` |
| 8 | `M/sourcing/**`, `runtime-skills/acquisition/source-*/**`, `evals/acquisition/source-*/**` |
| 9 | `M/enrichment/**`, `M/compliance/**`, `src/platform/http/**`, `runtime-skills/acquisition/enrich-*/**`, `evals/acquisition/enrich-*/**` |
| 10 | `M/audits/**`, `src/platform/browser/**`, `runtime-skills/acquisition/audit-*/**`, `evals/acquisition/audit-*/**` |
| 11 | `M/scoring/**`, `M/crosssell/**`, `runtime-skills/acquisition/score-*/**`, `evals/acquisition/score-*/**` |
| 12 | `M/outreach/**`, `runtime-skills/acquisition/outreach-*/**`, `evals/acquisition/outreach-*/**`, `src/app/(public)/**`, `src/app/api/unsubscribe/**`, `src/app/api/webhooks/outbound/**` |
| 13 | `M/inbox/**`, `runtime-skills/acquisition/inbox-*/**`, `evals/acquisition/inbox-*/**`, `src/app/api/webhooks/inbound/**` |
| 14 | `M/pipeline/**` (meetings, proposals, deals, handoff), `runtime-skills/acquisition/pipeline-*/**`, `evals/acquisition/pipeline-*/**`, `src/app/api/webhooks/calendar/**` |
| 15 | `A/*.tsx` (module layout, page, loading, error), `A/[line]/*.tsx`, `A/[line]/search/**`, `A/[line]/review/**`, `M/ui/shell/**`, `M/ui/search/**`, `M/ui/review/**` |
| 16 | `A/[line]/leads/**`, `A/[line]/pipeline/**`, `A/[line]/inbox/**`, `M/ui/leads/**`, `M/ui/pipeline/**`, `M/ui/inbox/**` |
| 17 | `A/[line]/analytics/**`, `A/overview/**`, `M/analytics/**`, `M/ui/analytics/**`, `runtime-skills/acquisition/analytics-*/**`, `evals/acquisition/analytics-*/**` |
| 18 | `A/[line]/settings/**`, `src/app/(platform)/settings/**`, `src/app/(platform)/admin/**`, `M/ui/settings/**`, `src/components/admin/**` |
| 19 | `M/manifest.ts`, `M/README.md`, `M/workflows/**` (pipeline orchestration), `M/ui/widgets/**` (platform-home widgets for acquisition), `tests/e2e/**`, `tests/integration/**`, `prisma/seed/staging/**`, `docs/architecture.md`, `docs/schedules.md` |
| 20 | `docs/hardening-report.md`, `docs/cost-model.md`, `evals/_redteam/**`, `tests/chaos/**` (plus hardening fixes anywhere; see the grants below) |
| 21 | `docs/runbook.md`, `docs/onboarding.md`, `docs/launch-checklist.md`, `docs/go-live-log.md`, `docs/handover/**` (plus deploy config; see the grants below) |

**Created by one phase, owned by another, and other grants.** These become `alsoAllow` grants in `ownership.json`; they never create a second owner.

| Path | Created by | Owner afterwards, or grant holder |
|---|---|---|
| `src/app/layout.tsx`, `global-error.tsx`, `not-found.tsx`, `src/app/(platform)/layout.tsx` and `page.tsx` (placeholders), `src/styles/**` (seed tokens), `public/brand/**` (logo copy) | 1 | 4 |
| `.gitignore`, `.env.example` (new variables from later phases arrive through `REQUESTS.md`) | 0 | 1 |
| A one-paragraph `README.md` in every folder above (skeleton) | 1 | That folder's owner |
| `package.json` **scripts only**, adding the phase's own named scripts (`registry:gen`, `db:validate`, `create-module`, `db:deploy`, `db:reset`, `postinstall` and the `pre*` generation hooks for 2; `evals` for 5; `jobs:run`, `credentials:rotate` for 6; `profiles:check` for 7; `seed:staging` for 19; `bootstrap:admin` for 21) | 1 | 1; grants to 2, 4, 5, 6, 7, 19, 21 (Phase 4 adds the design-system runtime deps: Radix, cmdk, sonner, vaul, recharts, TanStack Table, nuqs, dnd-kit) |
| The saas-skills marker block at the end of `CLAUDE.md`, and the "Stack and commands" section of `.claude/project-rules.md` (content only; any other change goes through REQUESTS.md) | 0 | 0; grant to 1 |
| `M/manifest.ts` (initial version) | 2 | 19 |
| `src/lib/money.ts` and `src/lib/money.test.ts` (`docs/contracts/common.md`) | 2 | 1; grant to 2 |
| `tests/e2e/phase-01/**` (the scaffold smoke test; Phase 3's sign-in redirect and Phase 4's home page change what it sees) | 1 | 19; grants to 3 and 4 |
| `src/app/(auth)/**` restyle with shared components (`alsoAllow`, behaviour unchanged) | 3 | 3; 18 restyles |
| Hardening fixes anywhere (`alsoAllow: **`), each change recorded against a finding ID | — | 20 |
| Deploy config: `vercel.json`, `.github/workflows/**`, `scripts/bootstrap-*` (`alsoAllow`) | 1 | 1; 21 edits |

A future module (for example `src/modules/marketing/`) gets its own rows when its spec is written (`docs/prompts/wave-5/adding-a-new-module.md`).

## Conventions

- **Naming:**
  - Files and folders are kebab-case (`lead-state.ts`). React components are PascalCase exports.
  - Database access lives only in `src/platform/db/**`, `prisma/**` or files named `*.repo.ts`.
  - Seam stand-ins go in `_seams.ts` with a `// SEAM:<ID>` marker.
  - Actions are named `module.resource.verb`; jobs `module.job-name` or `module.area.job-name`; AI tasks `module.task-name` (skill folder `runtime-skills/<module>/<task-name>/`, evals `evals/<module>/<task-name>/`); events are dotted, with lower camelCase segments (`lead.created`, `outreach.step.sent`, `ai.budget.warning`, `lead.needsAttention`), and each name is in `docs/contracts/events.md`; settings keys are dotted (`acquisition.unsubscribeScope`).
  - Every name comes from the specs and contracts; never invent a synonym.
- **Import aliases:** `@/platform/*`, `@/modules/*`, `@/contracts/*`, `@/components/*`, `@/lib/*` and `@/styles/*`, plus `@/*` → `src/*`. Modules talk to each other only through `@/platform/*`, `@/contracts/*`, `@/components/*`, `@/lib/*` and domain events (lint enforces this).
- **Server-only code:**
  - Any module that touches the database, secrets, provider SDKs or the session imports `server-only`.
  - Client components (`"use client"`) never import server modules. Compute permission-based data on the server and pass plain props.
  - Server actions live in an `actions.ts` next to their feature and follow saas-api's handler shape: authenticate → parse with Zod → authorize → service → typed result.
  - React Server Components call services directly.
- **Tests:**
  - Tests sit next to the code as `*.test.ts(x)`.
  - Integration tests run against a real test database (`futureuni_test`, or `futureuni_test_p<nn>` in a worktree).
  - End-to-end tests go in `tests/e2e/phase-<nn>/`, tagged `@smoke` when critical.
  - There's no real network in tests: MSW fails any unhandled request.
  - Time-dependent code takes an injectable `now()`.
- **Mocks:** each adapter has `<adapter>/mock.ts` beside the real implementation. The implementation is selected by `MOCKS` and settings, never by an `if` in feature code. Mocks return realistic data for both markets and can simulate failures.
- **Errors:**
  - Use one `AppError` (`src/lib/errors.ts`): `{ code, message, status, details? }`. Route handlers respond with `{ error: { code, message, details? } }`. Actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; error }`.
  - Codes: UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, VALIDATION_FAILED 422, CONFLICT 409, RATE_LIMITED 429, INVALID_TRANSITION 409, CONTACT_BLOCKED 409, SUPPRESSED 409, OUTSIDE_SEND_WINDOW 409, MAILBOX_CAP_REACHED 409, OUTREACH_PAUSED 409, CITATION_INVALID 422, BUDGET_EXCEEDED 429, PROVIDER_ERROR 502, PROVIDER_QUOTA_EXCEEDED 429, AI_OUTPUT_INVALID 502, AI_QUOTA_EXCEEDED 429, AI_TIMEOUT 504, AI_PROVIDER_ERROR 502, PAYLOAD_TOO_LARGE 413, UNSUPPORTED_MEDIA_TYPE 415, INTERNAL 500.
  - No stack traces or internals in responses.
- **Data:** IDs are cuid. Timestamps are UTC. Money uses minor units plus a currency, and the `Money` helpers in `@/contracts`. Scope always comes from the session, never from request input.
- **Logging:** structured, with no personal data or secrets (IDs only).

## Where the saas-* skills apply

- **saas-plan:** any new spec or feature that touches more than one screen, table or endpoint (`docs/specs/`).
- **saas-setup:** Phase 1 adopts this file and `.claude/project-rules.md`, and fills the block below. Hooks live in `.claude/settings.json`.
- **saas-ui:** every page, component, layout, chart and animation (Phases 3, 4, 12, 15–18). Pair it with the **dataviz** skill for charts.
- **saas-data:** the schema, migrations, seed, factories and non-trivial queries (Phase 2; data work in every phase).
- **saas-auth:** sessions, the permission map, invites and 2FA (Phase 3), plus every authorization check.
- **saas-api:** server actions, route handlers, webhooks, outbound calls and uploads (every backend phase).
- **saas-notify:** in-app notifications and platform email (Phase 6, and every phase that notifies).
- **saas-ai:** every AI task, prompt, eval and safety rule (Phase 5; the AI tasks in Phases 7–14 and 17).
- **saas-testing:** every test and every bug fix (failing test first).
- **saas-review:** the end of every phase, on the whole diff. Phase 20 runs it over the full repository.
- **saas-ship:** CI (Phase 1), hardening budgets (Phase 20), and deploy, monitoring and handover (Phase 21).
- **saas-billing:** not used; this product has no billing.

<!-- saas-skills:start -->
## SaaS skills

- Read `.claude/project-rules.md` before any work.
- Plan non-trivial features with saas-plan first.
- After any code change, run saas-review on the diff and fix all Critical and Major findings before reporting the task done.
- Never commit unless asked.
<!-- saas-skills:end -->
