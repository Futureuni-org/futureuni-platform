# Phase 01: Change requests

Changes Phase 1 needs in files it doesn't own. Apply them on `main` at merge time (merge procedure step 2). Each has an ID, type, target, the exact change and the reason.

No seams: Phase 1 has none.

---

## CR-01-01 · ownership · `CLAUDE.md` §"Ownership map"

1. Replace the sentence "`scripts/ownership/ownership.json` (Phase 1) is the machine-readable copy, and the ownership guard hook enforces it on `phase/*` branches." with:

   > `scripts/ownership/ownership.json` is the machine-readable source of truth, and the ownership guard hook (`scripts/ownership/guard.mjs`) enforces it on `phase/*` branches. Keep it and this table identical: `node scripts/ownership/check.mjs` fails when a path is claimed by two phases, and warns when the two differ, when a tracked file has no owner, or when an owned folder has no README.md. CI runs it.

2. Add to row **1**: `AGENTS.md`, `src/env.test.ts`.
3. Add to row **2**: `prisma.config.ts`.
4. Add a row to the grants table: `src/lib/money.ts` and `src/lib/money.test.ts` | created by 2 | owner 1; grant to 2.
5. Add a row to the grants table: `tests/e2e/phase-01/**` (the scaffold smoke test) | created by 1 | 19 (`tests/e2e/**`); grants to 3 and 4. Phase 3's sign-in redirect and Phase 4's new home page both change what that test sees, so they must be able to update or retire it.

**Reason:**
- `AGENTS.md` is written by create-next-app and refreshed by `next dev` (see CR-01-02).
- `src/env.test.ts` sits next to `src/env.ts`, which is owned as a single file, so the test had no owner.
- Prisma 7 reads `prisma.config.ts` from the repository root, which no row covered, so Phase 2's guard would block it.
- `docs/contracts/common.md` says Phase 2 implements `src/lib/money.ts` "through its grant", but no grant existed.
- `ownership.json` already contains all of these entries; the check shows them as the only differences from the table.

## CR-01-02 · doc · `CLAUDE.md` (top)

Add this line after the first heading:

> Next.js 16 agent rules (read before writing Next.js code): @AGENTS.md

**Reason:**
- create-next-app 16.3.6 writes `AGENTS.md`, a managed block telling agents to read the version-matched guides in `node_modules/next/dist/docs/`. `next dev` keeps it current.
- Its generated `CLAUDE.md` would have been just `@AGENTS.md`, so the import restores that link without overwriting our file.
- saas-setup says to keep generator-written agent instructions and follow them.

## CR-01-03 · ADR · `docs/decisions.md`: add ADR-035 "Toolchain pins"

> **ADR-035: Toolchain pins (Phase 1)**. Accepted, 2026-09-26.
>
> **Decision:**
> - **TypeScript 5.9.** typescript-eslint 8.70 supports TypeScript `>=4.8.4 <6.1.0`, and npm `latest` is now the native TypeScript 7.0. Never run a bare `pnpm add -D typescript`.
> - **ESLint 9.39.** eslint-config-next 16.3.6 depends on eslint-plugin-react, eslint-plugin-import and eslint-plugin-jsx-a11y, whose peer ranges stop at ESLint 9. ESLint 9 is marked deprecated on npm now that 10 is out.
> - **React 19.2.8**, the version create-next-app 16.3.6 pins with Next 16.3.6.
> - **Vitest 5.0 and jsdom 30.0.1.** jsdom 30.1.x has an open Blob/FormData bug with Vitest 5 (vitest#11336).
> - **The jest-dom type shim** in `tests/setup/jest-dom-vitest.d.ts`: jest-dom 7 doesn't type Vitest 5's `Matchers<R, T>` (jest-dom#738). Remove it when jest-dom PR #742 ships.
> - **`"type": "module"`.** Vite 8 warns on a CommonJS-loaded config, and Prisma 7's upgrade guide recommends it.
> - **pnpm 11.3** with `allowBuilds` in `pnpm-workspace.yaml`. Every dependency with an install script must be listed, or the install fails.
> - **The 24-hour release-age guard:** never add `minimumReleaseAgeExclude`; pick the previous version instead.
>
> **Reason:** these were the newest versions that work together on 2026-09-26. Upgrade them together when the blockers clear (typescript-eslint for TypeScript 6.1 or 7; Next's lint plugins for ESLint 10; jest-dom for Vitest 5).

## CR-01-04 · ADR note · `docs/decisions.md` ADR-003 (Vercel Workflow facts), for Phase 21

Add to ADR-003's "Platform facts", verified in the `workflow` 4.8.9 package and the Workflow docs on 2026-09-26:

> - Install `workflow` only. It pins `@workflow/next`; installing `@workflow/next` alone breaks the build (vercel/workflow#3580).
> - Locally, runs are stored in `.next/workflow-data/`. `pnpm exec workflow inspect runs|steps|events --runId <id>` and `pnpm exec workflow web` show them.
> - The builder generates `src/app/.well-known/workflow/v1/` (it writes its own `.gitignore`). `src/proxy.ts` must not intercept `/.well-known/workflow/`.
> - **On Vercel (Phase 21):**
>   - The project must have "Enable access to System Environment Variables" switched on, or every run fails before its first step.
>   - Workflow 4.x keeps its backend and run data in `iad1`, so co-locate functions there (`"regions": ["iad1"]` in `vercel.json`, ADR-033) or plan the 5.x upgrade for multi-region.
>   - Fluid compute should stay on.
> - Retry semantics are confirmed by Phase 1's proof (`phases/01/SUMMARY.md`):
>   - 3 retries by default (`fn.maxRetries` overrides).
>   - `RetryableError` / `FatalError` / `getStepMetadata().attempt` come from `workflow`.
>   - A completed step is replayed from the event log, never re-run.

## CR-01-05 · ADR note · `docs/decisions.md` ADR-024, plus a Phase 21 launch-checklist item

Add:

> Vercel's builds support pnpm up to 10 without Corepack. For pnpm 11 (`packageManager: pnpm@11.3.0`), set the project environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` (https://vercel.com/docs/builds/configure-a-build#corepack). Node 24 still ships Corepack.

**Reason:** without it, a Vercel build falls back to pnpm 9 or 10, which ignores `pnpm-workspace.yaml`'s `allowBuilds` and may resolve differently.

## CR-01-06 · doc · `docs/decisions.md` ADR-014 (fonts)

Replace "They're exposed as CSS variables (`--font-display`, `--font-sans`, `--font-mono`) and mapped in Tailwind with `@theme inline`." with:

> `next/font` exposes them as `--font-bricolage`, `--font-instrument-sans` and `--font-jetbrains-mono` (`src/styles/fonts.ts`). `src/styles/globals.css` maps them in `@theme inline` to Tailwind's `--font-display`, `--font-sans` and `--font-mono` (utilities `font-display`, `font-sans`, `font-mono`). The source names differ on purpose: `--font-sans: var(--font-sans)` would reference itself. `JetBrains_Mono` takes no `axes` option; its only axis is weight.

## CR-01-07 · doc · `docs/decisions.md` ADR-004 amendment (how `db:up` detaches)

Replace the bullet starting "**Starting it:**" with:

> - **Starting it:** `scripts/db.mjs` spawns `pg_ctl start` with Node's `detached: true` and `windowsHide: true`, which gives it its own hidden console. It survives the terminal closing (verified 2026-09-26: the starting shell exited, then new connections still worked).

Also replace "**`pnpm phase start`** clones `futureuni_p<nn>` with `createdb -T futureuni_dev`" with "**`pnpm phase start`** clones `futureuni_p<nn>` with `CREATE DATABASE … TEMPLATE futureuni_dev` (the SQL behind `createdb -T`) through `pg`, the same in native and docker mode".

## CR-01-08 · doc · `phases/README.md`

1. §"Worktrees", the `remove` line becomes:

   > `pnpm phase remove <nn> [--yes] [--force]   # removes the worktree, drops the phase databases, deletes the branch if merged; asks first unless --yes`

2. §"Worktrees": replace "Phase databases are cloned with `createdb -T futureuni_dev`." with "Phase databases are cloned with `CREATE DATABASE … TEMPLATE futureuni_dev` (and `futureuni_test`), the SQL behind `createdb -T`."
3. §"Merge procedure" step 1: after "run `pnpm install && pnpm registry:gen && pnpm check`", add "and `node scripts/ownership/check.mjs`".
4. §"Completed phases": add Phase 1 (done at merge).

## CR-01-09 · doc · `docs/contracts/common.md` §Errors

Change the comment "`// ---- Errors (the AppError class lives in src/lib/errors.ts, Phase 1) ----`" to:

> `// ---- Errors: APP_ERROR_STATUS, AppErrorCode and the AppError class are defined in src/lib/errors.ts (Phase 1). src/contracts/common.ts re-exports them instead of redefining them. ----`

**Reason:** there should be one definition of the code-to-status map. Phase 1's `src/lib/errors.ts` already matches the contract table exactly.

## CR-01-10 · script name · `.claude/project-rules.md` §"Stack and commands" (for Phase 2)

Add `db:deploy` (`prisma migrate deploy`) to the list of names later phases add: "`registry:gen`, `db:validate`, `create-module` and **`db:deploy`** (Phase 2)".

**Reason:**
- CI applies migrations with `pnpm exec prisma migrate deploy` (guarded until `prisma/schema` exists).
- saas-ship wants that behind a named script, and Phase 21's production migrate job needs the same command.
- `pnpm phase start` also uses it when a phase database can't be cloned.

## CR-01-11 · decision · provider keys in production (for Phase 21, with Phase 6's vault)

**Conflict:**
- The Phase 1 prompt, and `.env.example`'s header, say provider keys are "REQUIRED in production when MOCKS=false".
- But `docs/specs/platform.md` (`resolveProviderKey`, AC-16.2) and ADR-005 read a key from the credentials vault first, then env, and switch real providers on one at a time.
- Requiring all ten keys as environment variables would push secrets out of the encrypted vault, and would block `MOCKS=false` until every provider has one.

**What Phase 1 did:**
- `src/env.ts` requires the ten keys (`PRODUCTION_PROVIDER_KEYS`), plus each selected driver's credentials, only in the production deployment (`VERCEL_ENV=production`) with `MOCKS=false`.
- A local `next build` (where `NODE_ENV` is also `production`) doesn't require them.

**Decision needed (recommended):** once Phase 6's vault exists, drop the env requirement for keys the vault can hold, and let each adapter report "not configured" (`PROVIDER_ERROR`). Keep env-only secrets required (for example `CALCOM_WEBHOOK_SECRET` if it stays env-only). Update the `.env.example` header to match.
