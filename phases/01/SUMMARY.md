# Phase 01: Scaffold: Summary

| | |
|---|---|
| Phase | 01, Scaffold |
| Branch | `phase/01-scaffold` |
| Batch / wave | B0 / Wave 0 |
| Date finished | 2026-09-26 |
| Prompt | `docs/prompts/phase-01-scaffold.md` |
| Verification | `pnpm check`: Pass · `pnpm test:e2e`: Pass (6 tests, desktop and mobile) · `saas-review`: no open Critical/Major |

## What was built

The repository is now a strictly configured Next.js 16.3 app that later phases build on without touching shared config.
- **Home page:** `pnpm dev` serves a placeholder home in the FUTUREUNI tokens and fonts, in light and dark, with a theme switch.
- **Checks:** `pnpm check` (lint, typecheck, test, build) and `pnpm test:e2e` pass.
- **Local database:** `pnpm db:up` / `db:down` start and stop PostgreSQL 18, natively on this laptop (ADR-004) or with Docker.
- **Workflow:** Vercel Workflow is installed and proven (two steps, retry without re-running step 1).
- **Ownership:** a Claude Code hook blocks edits outside a phase's paths, and `pnpm phase` manages parallel worktrees.
- **CI:** a workflow runs on pull requests and on pushes to `main`.

Acceptance criteria met: P1-AC1 to P1-AC6. P1-AC4 was verified after the merge (a worktree starts from `main`): `pnpm phase start 99 test` created `../futureuni-platform-99-test` on `phase/99-test` with `futureuni_p99` / `futureuni_test_p99` and port 3099 (`/api/health` answered there), the guard blocked another phase's path in it, `pnpm phase remove 99 --yes` refused while its dev server ran and then removed the folder, both databases and the branch.

## Files and folders created

| Path | Purpose |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc` | pnpm 11.3, Node 24, `"type": "module"`, the fixed scripts; `allowBuilds` for install scripts |
| `tsconfig.json` | strict + `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; the seven aliases; `next` and `workflow` plugins |
| `next.config.ts` | imports `src/env.ts` (fail fast), `withWorkflow`, `poweredByHeader: false` |
| `eslint.config.mjs` | Next core-web-vitals + typescript-eslint strict/stylistic type-checked + project rules (see Decisions) |
| `.prettierrc.mjs`, `.prettierignore`, `.editorconfig`, `.gitattributes` | Prettier with Tailwind sorting (Markdown and docs never reformatted); LF everywhere |
| `postcss.config.mjs`, `src/styles/tokens.css`, `src/styles/globals.css`, `src/styles/fonts.ts` | Tailwind 4, every project-rules token (light on `:root`, dark on `[data-theme="dark"]`), `@theme inline` mapping, no default palette, base layer, fonts (ADR-014) |
| `src/env.ts` (+ `src/env.test.ts`) | the Zod-validated environment |
| `src/lib/errors.ts`, `result.ts`, `cn.ts`, `theme.ts`, `use-theme.ts`, `app-info.ts` (+ tests) | `AppError`, `ActionResult`, class merge that knows the project's tokens, theme script and hook, app version |
| `src/app/layout.tsx`, `global-error.tsx`, `not-found.tsx`, `(platform)/layout.tsx`, `(platform)/page.tsx` | root layout and placeholders (owned by Phase 4 from now on) |
| `src/app/api/health/route.ts` (+ test) | `GET /api/health` → `{ status, version, commit, mocks }` |
| `public/brand/futureuni-mark.png` | copy of `docs/brand/futureuni-logo.png` |
| `.env.example` (unchanged), `.env.local` (gitignored, generated) | local environment |
| `scripts/env-init.mjs`, `scripts/mocks.mjs`, `scripts/next.mjs`, `scripts/db.mjs`, `scripts/phase.mjs`, `scripts/ci-env.mjs` | first-time env, `mocks:on/off`, dev/start on `PORT`, local database, worktrees, CI secrets |
| `scripts/lib/*.mjs` (+ `.d.mts` types, tests) | `.env` editing, local database helpers, `pnpm phase` helpers |
| `scripts/ownership/ownership.json`, `lib.mjs`, `guard.mjs`, `check.mjs` (+ `guard.test.ts`) | the machine-readable ownership map, the guard hook, the map check and the branch-diff check (`--phase-diff`) |
| `scripts/lint-fixtures/**`, `scripts/lint-rules.test.ts` | deliberately broken files, and the test proving the lint rules fire |
| `vitest.config.ts`, `tests/setup/*` | Vitest projects `dom` (jsdom) and `node`, MSW (an unhandled request fails the test), jest-dom, the test environment (always a `futureuni_test(_pNN)` database), `server-only` stub |
| `playwright.config.ts`, `tests/e2e/phase-01/scaffold.spec.ts` | Playwright desktop 1440 and mobile 375, `@smoke` suite |
| `docker-compose.yml`, `docker/postgres/init/01-databases.sql` | `postgres:18` for machines with Docker |
| `vercel.json` | `$schema` and an empty `crons` array (Phase 6 fills it) |
| `.github/workflows/ci.yml` | CI: verify job + Playwright smoke job, `postgres:18` service |
| `.claude/settings.json`, `.claude/hooks/saas-verify.mjs` | saas-setup's lint+typecheck hook and the ownership guard hook |
| `AGENTS.md` | Next.js 16's agent rules (written by create-next-app, refreshed by `next dev`) |
| `README.md`, and a `README.md` in each of the 89 owned folders | setup, scripts, phases; the folder skeleton with each folder's owner |

`CLAUDE.md` (saas-skills block only) and `.claude/project-rules.md` ("Stack and commands" only) were edited under Phase 1's grants.

## Public interfaces other phases can use

```ts
// @/env: validated environment (server). Import only from server code.
export const env: ServerEnv;                        // e.g. env.MOCKS (boolean), env.DATABASE_URL, env.STORAGE_DRIVER
export const publicEnv: PublicEnv;                  // NEXT_PUBLIC_* only; safe in the browser
export function parseEnv(source: EnvSource): ServerEnv;        // throws EnvValidationError naming every bad variable
export const ENV_KEYS: readonly string[];            // every variable the schema knows
export const PRODUCTION_PROVIDER_KEYS: readonly [...];         // required in production when MOCKS=false

// @/lib/errors (docs/contracts/common.md §Errors)
export const APP_ERROR_STATUS: { UNAUTHENTICATED: 401, ... INTERNAL: 500 };
export type AppErrorCode = keyof typeof APP_ERROR_STATUS;
export class AppError extends Error { code; status; details; constructor(code, message?, { details?, cause? }?); toShape(): AppErrorShape }
export function toAppError(error: unknown): AppError;         // unknown → INTERNAL, original kept as `cause`
export function errorResponse(error: unknown): Response;      // route handlers: { error: { code, message, details? } } + status

// @/lib/result
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code; message; details? } };
export function ok<T>(data: T): ActionResult<T>;
export function err<T = never>(error: unknown): ActionResult<T>;

// @/lib/cn
export function cn(...inputs: ClassValue[]): string;

// @/lib/theme (server-safe) and @/lib/use-theme ("use client")
export const THEME_STORAGE_KEY = "futureuni-theme";
export type ThemePreference = "light" | "dark" | "system"; export type ResolvedTheme = "light" | "dark";
export function ThemeScript(props: { nonce?: string }): ReactElement;   // in <head> of the root layout
export function useTheme(): { preference; theme; setPreference(next) };  // re-exported from @/lib/theme
export function applySavedTheme(): void;                                 // for pages rendered without ThemeScript

// @/styles/fonts
export const displayFont, sansFont, monoFont; export const fontVariables: string; // put on <html>
```

- **Route:** `GET /api/health` returns `{ status: "ok", version, commit, mocks }` with `no-store`. It's public and carries no secrets.
- **Tailwind utilities from the tokens:**
  - colours: `bg-surface`, `bg-zone`, `bg-elevated`, `text-foreground`, `text-heading`, `text-muted`, `text-subtle`, `bg-primary` / `text-primary-foreground`, `bg-primary-soft`, `bg-accent`, `border-border`, `border-input`, `ring-focus`, `bg-success(-soft)` and the other statuses, `bg-chart-1`…`8`, `bg-scrim`;
  - effects and shape: `shadow-soft`, `shadow-lift`, `rounded-sm|md|lg|xl`;
  - type: `font-display`, `font-sans`, `font-mono`;
  - motion: `ease-standard|emphasized|exit`, `duration-fast` and the other durations (or `duration-(--duration-fast)`);
  - dark mode: `dark:` follows `data-theme`.
- **Test helpers:** `tests/setup/msw-server.ts` exports `server` (`server.use(http.get(...))`); `tests/setup/test-env.ts` exports `TEST_ENV`.
- **Settings, jobs, events, AI tasks:** none.

## Decisions made (and any new ADRs proposed)

- **Toolchain pins** (proposed ADR-035, CR-01-03): TypeScript 5.9, ESLint 9.39, React 19.2.8, Vitest 5 + the jest-dom type shim, jsdom 30.0.1, `"type": "module"`, pnpm 11 `allowBuilds`. Two dependencies were one version back because of pnpm's 24-hour release-age guard: motion 13.4.3 (13.4.4 was published the day before) and react-hook-form 7.88.0 (7.89.0 was published hours earlier).
- **ESLint project rules** (all errors, in TypeScript and JavaScript files alike; `pnpm lint` fails on any warning):
  - `no-explicit-any`; `ban-ts-comment` (no `ts-ignore` or `ts-nocheck`; `ts-expect-error` needs a 10+ character description); `no-non-null-assertion`; `no-console` except `warn` and `error`.
  - **Inline config is off** (`linterOptions.noInlineConfig`), so an `eslint-disable` comment can't silence a rule; it only earns a warning, which fails `pnpm lint`.
  - **`no-restricted-imports`, as regexes on the import source** (aliases, relative paths and subpaths alike), and the same bans for dynamic `import()` through `no-restricted-syntax`:
    - `@anthropic-ai/sdk` only in `src/platform/ai/**`;
    - `@prisma/client` and the generated client only in `src/platform/db/**`, `prisma/**` and `*.repo.ts`;
    - `src/contracts/**` may import `@/generated/prisma/enums` and nothing else from it.
  - `boundaries/dependencies`: a module never imports another module, and the platform never imports a module except `src/platform/registry/generated.ts`. It catches alias and relative imports, in `.ts(x)` and `.js(x)`.
  - `no-restricted-syntax`: no hex, `rgb/hsl/hwb/lab/lch/oklab/oklch` colours in string or template literals (Tailwind arbitrary values included) outside `src/styles/**` and `src/lib/chart-theme.ts`. A URL fragment spelled like a hex colour (`"#add"`) is a known false positive; named colours aren't caught (the palette is removed, so `bg-red` doesn't exist).
  - `.d.ts`/`.d.mts` files may keep unused type parameters, which declaration merging needs.
- **"use client" importing server-only modules:** no maintained ESLint rule exists (checked 2026-09-26). The `server-only` package's build-time error is the guard.
- **Theme:** `data-theme` on `<html>`, set before paint from the saved choice (`localStorage` `futureuni-theme`), then the OS preference, then light.
  - Blocked storage counts as "no saved choice", so the OS preference still applies, and a choice that can't be saved is kept for the page.
  - `useTheme` lives in `src/lib/use-theme.ts` (a client module) and `src/lib/theme.ts` re-exports it; the production build accepts that.
- **Tailwind theme:** only the project's tokens. The default palette, shadow, inset-shadow, drop-shadow and text-shadow sets and the serif stack are removed, and the 4px spacing base is explicit.
- **Environment:**
  - Blank values count as unset, and `.env.example` placeholders are rejected.
  - The encryption key must decode to exactly 32 bytes, and the other secrets need 32 or more characters.
  - Provider keys are required in the production deployment (`VERCEL_ENV=production`) when `MOCKS=false`, plus each selected driver's credentials (Gmail API OAuth, Vercel Sandbox snapshot, the fallback capture service). A local `next build` doesn't require them, and CR-01-11 asks Phase 21 to reconcile the rule with the credentials vault.
  - On Vercel, `STORAGE_DRIVER=local` is rejected (read-only filesystem), and `SKIP_ENV_VALIDATION` is ignored.
  - On the server the full environment is validated first, so one error lists every bad variable, public ones included.
  - In the browser, reading a server variable throws. A test keeps `.env.example` and the schema identical.
- **The ownership guard is live in Claude Code:**
  - It uses the exec form (`node` + `${CLAUDE_PROJECT_DIR}/scripts/ownership/guard.mjs`) and blocks with exit code 2 and the message the prompt specifies.
  - The branch and the map come from the checkout that holds the target file, so an edit in a sibling phase worktree is judged by that worktree's branch.
  - An unowned path is blocked with "(owner: none)". A branch that starts with `phase/` but is malformed blocks every edit. A guard error or unreadable map blocks on a phase branch (fails closed).
  - **Shell writes (Bash, PowerShell) bypass the hook**, so `node scripts/ownership/check.mjs --phase-diff` checks a whole branch diff (committed, uncommitted and untracked). `pnpm phase finish` runs it, and CI runs it on `phase/*` pull requests.
  - The most specific pattern wins: an exact path beats a glob, then the longer literal prefix wins.
  - It was proven live this session: a write to `src/platform/auth/guard-probe.ts` on `phase/01-scaffold` was blocked with "Phase 01 does not own src/platform/auth/guard-probe.ts (owner: Phase 03)…".

## Dependencies added

| Package | Version | Why |
|---|---|---|
| next, react, react-dom | 16.3.6, 19.2.8, 19.2.8 | The framework (create-next-app 16.3.6 pins) |
| zod | 4.6.5 | All validation (env now, contracts from Phase 2) |
| @prisma/client, @prisma/adapter-pg, pg | 7.10.0, 7.10.0, 8.23.0 | Prisma 7 over a `pg` pool (ADR-019), for Phase 2 |
| @vercel/functions | 3.9.9 | `attachDatabasePool` for the pool on Fluid Compute (ADR-019) |
| react-hook-form, @hookform/resolvers | 7.88.0, 5.9.1 | Forms (ADR-001) |
| motion | 13.4.3 | Animation (`motion/react`, ADR-001) |
| lucide-react | 1.48.0 | Icons (project-rules) |
| clsx, tailwind-merge, class-variance-authority | 2.1.1, 3.7.0, 0.7.1 | `cn()` and component variants |
| server-only | 0.0.1 | Marks server modules; a build error if one reaches the client |
| date-fns, date-fns-tz | 4.4.0, 3.2.0 | Dates and time zones (INV-12) |
| workflow | 4.8.9 | Vercel Workflow (ADR-003) |
| @vercel/blob | 2.8.0 | File storage (ADR-003), for Phase 6 |
| better-auth | 1.7.6 (`~1.7.6`) | Auth library, installed only (ADR-013; Phase 3 configures it) |
| @anthropic-ai/sdk | 0.128.0 | Claude, importable only in `src/platform/ai` (ADR-006) |
| typescript, @types/node, @types/react, @types/react-dom, @types/pg | 5.9.3, 24.x, 19.x, 19.x, 8.23 | Types |
| tailwindcss, @tailwindcss/postcss | 4.3.3 | Styling |
| eslint, eslint-config-next, @eslint/js, typescript-eslint, globals | 9.39.5, 16.3.6, 9.39.5, 8.70.1, 17.12.0 | Linting |
| eslint-plugin-boundaries, eslint-import-resolver-typescript | 7.2.0, 4.4.5 | Module import boundaries (and the alias resolver they need) |
| eslint-config-prettier, prettier, prettier-plugin-tailwindcss | 10.1.8, 3.9.9, 0.8.1 | Formatting and Tailwind class sorting |
| prisma | 7.10.0 | Prisma CLI, for Phase 2 |
| dotenv | 18.0.3 | `prisma.config.ts` loads `.env` (Prisma 7 no longer does), for Phase 2 |
| tsx | 4.23.15 | Running TypeScript scripts (Phase 2 codegen and seed) |
| vitest, @vitest/coverage-v8, vite, @vitejs/plugin-react | 5.0.1, 5.0.1, 8.3.1, 6.1.1 | Unit and component tests; Vite 8 resolves tsconfig paths |
| jsdom | 30.0.1 | The DOM test environment (pinned; see ADR-035) |
| @testing-library/react, dom, jest-dom, user-event | 16.3.3, 10.4.2, 7.0.1, 14.6.7 | Component tests |
| msw | 2.15.0 | Fails any unhandled network request in tests |
| @faker-js/faker | 10.6.0 | Seeds and factories (Phase 2) |
| @playwright/test | 1.63.0 | End-to-end tests |

## Change requests raised

`phases/01/REQUESTS.md`:
- **CR-01-01** (ownership, `CLAUDE.md`): name `ownership.json` as the source of truth and the check command; add `AGENTS.md` and `src/env.test.ts` (Phase 1) and `prisma.config.ts` (Phase 2); add the `src/lib/money.ts` grant to Phase 2 and the `tests/e2e/phase-01/**` grant to Phases 3 and 4.
- **CR-01-02** (doc, `CLAUDE.md`): the `@AGENTS.md` import.
- **CR-01-03** (ADR): ADR-035, toolchain pins.
- **CR-01-04** (ADR note): Workflow facts, including Vercel's `iad1` and system-env-vars requirements, for Phase 21.
- **CR-01-05** (ADR note): pnpm 11 on Vercel needs `ENABLE_EXPERIMENTAL_COREPACK=1`.
- **CR-01-06** (doc): ADR-014 font variable names.
- **CR-01-07** (doc): the ADR-004 amendment wording for `db:up` detachment and database cloning.
- **CR-01-08** (doc): `phases/README.md` worktree and merge steps.
- **CR-01-09** (doc): `docs/contracts/common.md`, so `APP_ERROR_STATUS` has one definition.
- **CR-01-10** (script name): `db:deploy` for Phase 2.
- **CR-01-11** (decision, for Phase 21): reconcile "provider keys required in production" with the vault-first credentials design.

**Seams:** none in this phase.

## Differences from the prompt, and why

1. **Local Postgres runs natively on the build laptop** (ADR-004 amendment, Prince's choice). `db:up`/`db:down` support native and Docker modes. `docker-compose.yml` exists but couldn't be run here, because Docker isn't installed; only its structure was checked. CI uses a service container.
2. **Postgres 18.** "The version Neon currently runs by default (verify)": Neon made 18 the default for new projects on 2026-06-05. The laptop moved from 17.11 to 18.6 at Prince's choice (the SHA-256 matched Scoop's manifest), and Docker and CI use `postgres:18`.
3. **The `pg_trgm` and `citext` extensions aren't pre-created** in the Docker init script. The image ships them, and Phase 2's init migration creates them (ADR-019), so no pre-created extension can cause Prisma drift.
4. **Root `layout.tsx`, `global-error.tsx` and `not-found.tsx` are owned by Phase 4**, as `CLAUDE.md` and Wave 1's Part A1 already say, with Phase 1 as creator (`alsoAllow`). The prompt said Phase 1 would own them.
5. **Phase databases are cloned with `CREATE DATABASE … TEMPLATE`** through `pg` (what `createdb -T` runs), so the same code works in native and Docker mode.
6. **`dev` and `start` run through `scripts/next.mjs`,** because Next.js ignores `PORT` in `.env` files and each worktree needs its own port.
7. **`env-init` is `node scripts/env-init.mjs`, and the ownership check is `node scripts/ownership/check.mjs`,** because the prompt fixes the package script names.
8. **`"type": "module"`** in `package.json`, which removes Vite 8's CommonJS-config warning (ADR-035).
9. **The placeholder home is a client component,** so the theme buttons live in the placeholder file Phase 4 replaces.
10. **The Phase 2 grants** for `tests/factories/**`, `src/modules/acquisition/core/**` and `src/platform/directory/**` are already Phase 2 `owns` in `CLAUDE.md`, so they aren't duplicated as `alsoAllow`.
11. **CI builds against generated throwaway secrets** (`scripts/ci-env.mjs`) instead of `SKIP_ENV_VALIDATION`, so CI also proves the environment validates.
12. **The hook matcher keeps `MultiEdit`** as the prompt says, although current Claude Code has no such tool (harmless).

## Vercel Workflow proof (done, and the files deleted)

- **Throwaway files:**
  - `src/lib/workflow-proof.ts`: `twoStepProof` (`"use workflow"`) with `stepOne` and `stepTwo` (`"use step"`). Each appended its `getStepMetadata().attempt` to `.workflow-proof.log`. `stepTwo` threw `RetryableError("simulated transient failure", { retryAfter: 1000 })` on attempt 1.
  - `src/app/api/health/workflow-proof/route.ts`: `POST` called `start(twoStepProof, [tag])` from `workflow/api` and awaited `run.returnValue`.
- **Commands:** `pnpm dev` (Turbopack; "workflows build complete (6 steps, 1 workflow)"), then `curl -X POST http://localhost:3000/api/health/workflow-proof`.
- **Result:** HTTP 200 in 7.7 s: `{"runId":"wrun_01M3E81R0DP8BB3A0V82HJ51W4","result":["step 1 done","step 2 done"],"log":["… step-1 attempt 1","… step-2 attempt 1","… step-2 attempt 2"]}`. Step 1 ran once, and step 2 failed once and then succeeded.
- **`pnpm exec workflow inspect events --runId wrun_01M3E81R0DP8BB3A0V82HJ51W4`:**
  - `stepOne`: `step_created`, `step_started`, `step_completed`, once;
  - `stepTwo`: `step_created`, `step_started`, `step_retrying`, `step_started`, `step_completed`;
  - then `run_completed`.
- **`workflow inspect steps`:** both steps `C` (completed).
- The files and the log were deleted afterwards.
- **Windows note:** a dev server started from a detached background shell with no console (as Claude Code's background Bash runs it) can't spawn Turbopack's Node helper processes (`0xC0000142`). A normal terminal, or a hidden console window, works.

## Known limitations

- **Docker Compose is untested here** (no Docker), and **CI hasn't run**, because the repo isn't on GitHub yet. `ci.yml` passes `actionlint` 1.7.12.
- **`pnpm phase start/remove`** are verified after the merge, because a worktree starts from `main`.
- **`db:*` Prisma scripts fail until Phase 2 adds the schema,** as expected.
- **`typecheck` needs a valid environment,** because `next typegen` loads `next.config.ts`. Run `node scripts/env-init.mjs` first; CI generates one.
- **PostgreSQL doesn't start with Windows:** run `pnpm db:up` after a restart.
- **The favicon** is the PNG mark until Phase 4 generates the icon set from the approved draft.
- **Next.js telemetry** is on by default (CI sets `NEXT_TELEMETRY_DISABLED=1`). Run `pnpm exec next telemetry disable` to turn it off on your machine.
- **The Phase 1 smoke test will fail once Phase 3 redirects signed-out visitors to `/login`.** Phases 3 and 4 have a grant for `tests/e2e/phase-01/**` (CR-01-01) to update or retire it.
- **`src/lib/theme.ts` and `src/lib/use-theme.ts` import each other** (constants one way, the hook re-export the other). It's harmless, because neither uses the other at load time.

## How to test it

```bash
pnpm install
node scripts/env-init.mjs          # only if .env.local doesn't exist
pnpm db:up                         # native PostgreSQL 18 on localhost:5432
pnpm check                         # lint, typecheck, test (Vitest), build
pnpm test:e2e                      # Playwright smoke: desktop 1440 and mobile 375
pnpm dev                           # http://localhost:3000: the placeholder home; Light, Dark and System buttons
curl http://localhost:3000/api/health
node scripts/ownership/check.mjs   # no duplicate owners; warnings only until CR-01-01 is applied
```

- **Guard:** `echo '{"tool_input":{"file_path":"<repo>/src/platform/auth/x.ts"}}' | node scripts/ownership/guard.mjs` exits 2 with the message on a `phase/*` branch, and exits 0 on `main`.
- **Env fail-fast:** `DATABASE_URL= pnpm build` fails, naming `DATABASE_URL`.
- **Worktrees (after the merge):** `pnpm phase start 99 test`, `pnpm phase list`, `pnpm phase remove 99 --yes`.

## Review (saas-review)

Two independent reviewers covered the whole diff (security and scripts; app, styles, tests and lint). Every Critical and Major finding is fixed or recorded as a decision:

| # | Severity | Finding | Outcome |
|---|---|---|---|
| S1 | Major | Shell writes bypass the edit hook; nothing checked a branch's diff | Fixed: `check.mjs --phase-diff`, run by `pnpm phase finish` and CI |
| S2 | Major | Production required every provider key as an env variable, conflicting with the vault-first design, and it fired on local builds | Scoped to `VERCEL_ENV=production`; the decision is raised as CR-01-11 |
| A1 | Major | The contracts "enums only" rule also blocked the enums import | Fixed: regex import bans, plus contract fixtures |
| A2 | Major | Vitest and Playwright ignored a worktree's `.env.local` (shared test database and e2e port) | Fixed: both read it; tests refuse anything but `futureuni_test(_pNN)` |
| A3 | Major | No phase could update the Phase 1 smoke test that Phase 3's redirect will break | Fixed: grant to Phases 3 and 4 (CR-01-01) |
| S3–S7, A4–A8 | Minor | Public-variable errors hid the rest; `SKIP_ENV_VALIDATION` on Vercel; the storage driver on Vercel; guard edge cases (sibling worktree, malformed branch, `..name`, errors); partial state in `phase start/remove`; theme with blocked storage; `cn()` unaware of custom tokens; JS files and dynamic `import()`; `eslint-disable` allowed; default shadow sets | All fixed, with tests |
| Nits | Nit | `.gitignore` pattern, letter case, `.env.local` mode 0600, the signing key length, a browser-guard test, the spacing scale, `preload`, error copy, `aria-live`, MSW failing the test, more colour fixtures, eyebrow size | Fixed. Not changed: the `#add` false positive and named colours (documented) |

I also found and fixed that `pnpm phase list/remove` treated the main folder as a phase worktree when it was on a phase branch.

**Fixed after the merge (commit on `main`), found by the P1-AC4 run:**
- On Windows, `git worktree remove` can't delete pnpm's long `node_modules` paths, and a folder a process is still using made git unregister the worktree before failing.
- `pnpm phase remove` now checks for uncommitted changes and for a folder in use (Windows refuses to rename it), then deletes the build folders with Node, then lets git remove the worktree.
- It's resumable: an interrupted remove is finished by running it again.
