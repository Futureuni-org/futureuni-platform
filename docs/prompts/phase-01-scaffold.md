# Phase 1: Scaffold

> **How to run this phase**
> 1. Phase 0 must be finished and committed on `main`.
> 2. Put this file at `docs/prompts/phase-01-scaffold.md`.
> 3. Create the branch: `git checkout -b phase/01-scaffold`. Wave 0 runs one phase at a time, so no worktree is needed yet.
> 4. Open Claude Code in the repo. Use Opus at maximum effort and switch to plan mode.
> 5. Say: **"Read docs/prompts/phase-01-scaffold.md and execute it. Plan first."**
> 6. When it's done, check the "Done when" list, then merge into `main`.
>
> Wave 0, sequential. It depends on Phase 0. Phase 2 depends on it.

---

## Your role and the goal of this phase

You are setting up the foundation of the **FUTUREUNI Internal Platform** repository. Phase 0 already wrote the requirements pack: specs, rules, contracts, the data model, decisions and the ownership map. Your job is to turn this empty repository into a working, strictly configured Next.js project that every later phase can build on without having to touch shared configuration again.

**This phase creates the tooling, not features.** When you're done:

- `pnpm dev` starts an app that renders a placeholder page using the FUTUREUNI brand tokens and fonts
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` all pass
- local Postgres runs in Docker
- Vercel Workflow is installed and proven to work
- a Claude Code hook stops any phase from editing folders it doesn't own
- one script sets up a worktree for a parallel phase

**The `saas-setup` skill leads this phase, in Mode A (new project).** Phase 0 has already written `CLAUDE.md` and `.claude/project-rules.md`, so saas-setup must **adopt and complete them, not overwrite them** (see Step 2).

---

## Step 0: Read first

Read these in full before planning:

1. `CLAUDE.md`
2. `.claude/project-rules.md`
3. `docs/specs/platform.md`
4. `docs/decisions.md`
5. `docs/integrations.md`
6. `docs/contracts/jobs.md`
7. `phases/README.md`
8. `phases/00/SUMMARY.md`
9. `.env.example`
10. The global skills `saas-setup`, `saas-ui` (only the token and typography sections), `saas-testing`, `saas-review` and `saas-ship` (only the CI section)

Use the Context7 MCP server to check the **current** setup instructions for everything you configure: Next.js, Tailwind CSS, Vercel Workflow, Vitest, Playwright, ESLint flat config, and the auth library chosen in `docs/decisions.md` (install it only, don't configure it). Don't rely on memory for config file formats or package names. If a doc contradicts this prompt on a technical detail, follow the doc and record the difference in your summary.

---

## What this phase may edit

This phase owns the root configuration listed for Phase 1 in the `CLAUDE.md` ownership map. It also has these explicit grants:

- **Create** every folder in the ownership map, each with a one-paragraph `README.md` saying which phase owns it and what goes there. This lets later phases start from a known skeleton.
- **Create temporary placeholders** that later phases will replace:
  - `src/app/(platform)/page.tsx`, the home placeholder, owned by Phase 4 afterwards
  - `src/app/(platform)/layout.tsx`, owned by Phase 4 afterwards
- **Create and own** these paths. Raise a change request so the `CLAUDE.md` table lists them:
  - `src/app/layout.tsx` (root)
  - `src/app/global-error.tsx`
  - `src/app/not-found.tsx`
  - `src/app/api/health/`
  - `src/lib/` (except `motion.ts`, which Phase 4 owns)
  - `scripts/`
  - `tests/setup/`
- **Seed the design tokens** in `src/styles/`. Phase 4 owns and refines them afterwards.
- **Fill saas-setup's marker block** at the end of `CLAUDE.md`, and **complete only the "Stack and commands" section** of `.claude/project-rules.md`. Everything else in Phase 0's files goes through `phases/01/REQUESTS.md`.

Don't create anything in `prisma/`, `src/contracts/`, `src/platform/` or `src/modules/`, apart from folder READMEs. Those belong to other phases.

---

## Step 1: Toolchain and project creation

1. **Package manager: pnpm.** It works well with worktrees because its store is shared.
   - Pin Node to the current LTS in `.nvmrc` and in `package.json` `engines`.
   - Set `packageManager` in `package.json`.
2. **Create the Next.js app in this folder** with the official generator:
   - TypeScript, App Router, `src/` directory
   - Tailwind CSS
   - ESLint
   - Import alias `@/*`
   - Keep the existing `docs/`, `.claude/`, `phases/`, `CLAUDE.md` and `.mcp.json` untouched. If the generator refuses a non-empty folder, generate in a temporary folder and move the files in.
3. **Make `tsconfig.json` strict:**
   - `strict`
   - `noUncheckedIndexedAccess`
   - `noImplicitOverride`
   - `exactOptionalPropertyTypes` (turn it off only if a core dependency makes it impractical, and record why)
   - `verbatimModuleSyntax`

   Add these path aliases, matching `CLAUDE.md`:

   | Alias | Path |
   |---|---|
   | `@/platform/*` | `src/platform/*` |
   | `@/modules/*` | `src/modules/*` |
   | `@/contracts/*` | `src/contracts/*` |
   | `@/components/*` | `src/components/*` |
   | `@/lib/*` | `src/lib/*` |
   | `@/styles/*` | `src/styles/*` |

4. **Install the baseline dependencies** so later phases rarely need to add shared ones. Check the current package names first.
   - **Runtime:**
     - `zod`
     - `@prisma/client` and `prisma` (dev), for Phase 2
     - the Neon/Prisma serverless adapter recommended for Vercel + Neon (verify)
     - `react-hook-form`, `@hookform/resolvers`
     - `motion`
     - `lucide-react`
     - `clsx`, `tailwind-merge`, `class-variance-authority`
     - `server-only`
     - `date-fns`, `date-fns-tz`
     - the Vercel Workflow package(s)
     - `@vercel/blob`
     - the auth library from the decisions log (install only)
     - `@anthropic-ai/sdk`. It's installed here, but may only be imported inside `src/platform/ai` (lint enforces this).
   - **Dev:**
     - `vitest`, `@vitest/coverage-v8`
     - `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
     - `jsdom`
     - `@playwright/test`
     - `tsx`
     - `prettier`, `prettier-plugin-tailwindcss`
     - `typescript-eslint`
     - `eslint-plugin-boundaries` (or an equivalent import-boundary plugin)
     - `msw`, for mocking HTTP in tests
     - `@faker-js/faker`, for seeds and factories
   - List every dependency in your summary with a one-line reason.

---

## Step 2: saas-setup (Mode A, adopting the Phase 0 files)

Run the `saas-setup` workflow, with these adjustments:

- **`.claude/project-rules.md` already exists.** Don't rewrite it.
  - Fill in the "Stack and commands" section with the actual scripts you create.
  - For any other gap you find, add it to `phases/01/REQUESTS.md` rather than editing.
- **`CLAUDE.md` already exists.** Insert saas-setup's standard block between the existing `<!-- saas-skills:start -->` and `<!-- saas-skills:end -->` markers. Don't duplicate rules that are already in `CLAUDE.md`. Reference them instead.
- **Hooks in `.claude/settings.json`**, merged with any existing settings:
  1. saas-setup's standard hook: when Claude finishes a turn in which files were edited, run `pnpm lint` and `pnpm typecheck` and feed failures back.
  2. **The ownership guard** (see Step 7), as a `PreToolUse` hook on the file-writing tools (Edit, Write, MultiEdit, NotebookEdit).
  - Use the current Claude Code hooks schema and check the docs.
- Everything must be idempotent: running this phase's setup again changes nothing.

---

## Step 3: Strict code quality configuration

1. **ESLint (flat config)** with the `typescript-eslint` strict and stylistic type-checked presets plus Next.js rules. Add these project rules as **errors**:
   - `@typescript-eslint/no-explicit-any`
   - `@typescript-eslint/ban-ts-comment`: no `@ts-ignore`; `@ts-expect-error` only with a description
   - `@typescript-eslint/no-non-null-assertion`
   - no `console.log` (allow `console.warn` and `console.error`)
   - **Import boundaries:**
     - `src/modules/<a>` may not import from `src/modules/<b>`. Modules only talk through `@/platform/*`, `@/contracts/*`, `@/components/*` and `@/lib/*`.
     - `src/platform/**` may not import from `src/modules/**`, except the generated registry file Phase 2 will create at `src/platform/registry/generated.ts`.
     - `@anthropic-ai/sdk` may only be imported inside `src/platform/ai/**`.
     - `@prisma/client` may only be imported inside `src/platform/db/**`, `prisma/**`, and files named `*.repo.ts`. Record this convention so it's obvious to later phases.
     - Client components (files with `"use client"`) may not import `server-only` modules. Rely on the `server-only` package plus a lint rule where one is available.
   - **No raw colour literals:** forbid hex, `rgb()` and `hsl()` literals in `.ts`/`.tsx` files outside `src/styles/` and `src/lib/chart-theme.ts`, using `no-restricted-syntax` with a regex on string literals.
2. **Prettier** with the Tailwind class sorting plugin, plus `.prettierignore`.
3. **`.editorconfig`**, and `.gitattributes` for LF line endings.
4. Write a test that proves the lint rules work. Put a few deliberately bad fixtures in `scripts/lint-fixtures/`, run ESLint on them in a Vitest test, and assert that the expected rule IDs fire. Exclude the fixtures from the normal lint run.

---

## Step 4: Design tokens, fonts and the root layout

Phase 4 builds the full design system. You lay down the tokens so the brand is correct from day one and nobody invents colours.

1. **`src/styles/tokens.css`:**
   - Every semantic token from the token table in `.claude/project-rules.md`, in **light** (the default, on `:root`) and **dark** (`[data-theme="dark"]`) values.
   - Include the spacing scale, radius, shadows (`shadow-soft`, `shadow-lift`), duration and easing tokens, and the chart series colours.
   - Raw hex values appear only in this file.
2. **Tailwind:** wire the tokens into Tailwind the way the installed Tailwind version expects (check the docs), so utilities like `bg-surface`, `text-muted`, `ring-focus` and `shadow-lift` exist. No default palette colours in app code; disable or ignore Tailwind's default colour palette where the version allows it.
3. **`src/styles/globals.css`:** base layer, font variables, focus-visible ring, reduced-motion base rule, and selection colour from the tokens.
4. **Fonts:** load the display, UI and mono faces chosen in `docs/decisions.md` with `next/font`, exposed as CSS variables.
5. **Theme:**
   - Light is the default.
   - A tiny inline script in the root layout sets `data-theme` before paint from the user's saved choice, then the OS preference, then light, so dark mode never flashes.
   - Expose a `ThemeScript` and a minimal `useTheme` hook in `src/lib/theme.ts` for Phase 4 to build the toggle on.
6. **Root layout:**
   - `src/app/layout.tsx` with the fonts, the theme script, `lang="en"`, and metadata (title template "%s · FUTUREUNI", `robots: noindex`, since this is an internal app).
   - A minimal `global-error.tsx` and `not-found.tsx` that use the tokens.
7. **Placeholder home** at `src/app/(platform)/page.tsx`:
   - a restrained, brand-correct page showing the FUTUREUNI logo from `docs/brand/` (copy it into `public/brand/`), the platform name, and "Scaffold ready"
   - a small token swatch strip, so the colours can be checked visually in light and dark
   - Phase 4 replaces it.
8. **`src/lib/cn.ts`** (class merge helper), **`src/lib/errors.ts`** (the single `AppError` shape defined in `CLAUDE.md`, with `code`, `message`, `status` and `details?`) and **`src/lib/result.ts`** if the conventions call for one.

---

## Step 5: Environment variables

1. **`src/env.ts`:** one Zod-validated environment module that separates server-only and public (`NEXT_PUBLIC_`) variables and **fails fast** with a readable error listing every missing or invalid variable.
   - It covers every variable in `.env.example`.
   - When `MOCKS=true`, provider keys (Anthropic, Google, SerpAPI, Hunter and so on) are optional.
   - When `MOCKS=false`, they're required in production.
   - `DATABASE_URL` (pooled) and `DIRECT_URL` (for migrations) are always required.
   - Include `CREDENTIALS_ENCRYPTION_KEY`: 32 bytes, base64, validated by length.
2. Import `src/env.ts` in `next.config` so a bad environment fails the build, not the first request.
3. Create a working `.env.local` from `.env.example` with local values: Docker database URLs, `MOCKS=true`, and a freshly generated encryption key. Confirm `.env.local` is gitignored.
4. **`pnpm mocks:on` / `pnpm mocks:off`** scripts that flip `MOCKS` in `.env.local`.
5. Unit tests for `src/env.ts`: valid env passes, missing required fails with a clear message, and the MOCKS-dependent rules work.

---

## Step 6: Local database, Vercel and Workflow

1. **`docker-compose.yml`:**
   - PostgreSQL at the version Neon currently runs by default (verify), with a named volume and a healthcheck
   - Port from env, default 5432
   - An init script that creates `futureuni_dev` and `futureuni_test`
   - Install the `pg_trgm` and `citext` extensions if Phase 0's data model uses them
2. **Package scripts.** Create exactly the scripts named in project-rules:
   - `dev`, `build`, `start`
   - `lint`, `lint:fix`, `format`
   - `typecheck` (`tsc --noEmit`)
   - `test`, `test:watch`
   - `test:e2e`
   - `db:up` / `db:down` (Docker)
   - `db:migrate`, `db:generate`, `db:seed`, `db:studio`, `db:reset`: wire these to Prisma commands now. They'll only work after Phase 2 adds the schema, which is expected.
   - `mocks:on`, `mocks:off`
   - `phase` (see Step 8)
   - `check`: lint, typecheck, test and build in sequence
3. **Vercel:**
   - `vercel.json` with an empty `crons` array (Phase 6 fills it from module manifests) and any function config the Workflow docs require.
   - Don't link or deploy the project. That's Phase 21.
4. **Vercel Workflow:**
   - Install and configure it exactly as the current docs say for Next.js, including any `next.config` wrapper.
   - **Prove it works:** create a throwaway two-step workflow and a route that starts it. Run it locally, confirm both steps complete, and confirm that a thrown error in step 2 retries without re-running step 1.
   - Record the exact commands and results in your summary, then **delete the throwaway files**. Phase 6 owns the real job framework.
5. **Health endpoint:** `src/app/api/health/route.ts` returns `{ status, version, commit, mocks }`. It returns no secrets. Phase 2 adds a database check through a change request if needed.

---

## Step 7: The ownership guard (key to safe parallel work)

This hook mechanically enforces the rule that a phase only edits folders it owns.

1. **`scripts/ownership/ownership.json`** is the machine-readable ownership map.
   - Its contents: the full table from `CLAUDE.md` plus the grants listed in "What this phase may edit".
   - Format:
     ```json
     {
       "phases": {
         "01": { "owns": ["package.json", "..."], "alsoAllow": [] },
         "02": { "owns": ["prisma/**", "src/contracts/**", "..."], "alsoAllow": [] }
       },
       "alwaysAllowed": ["phases/{phase}/**"]
     }
     ```
   - Use glob patterns.
   - Give **Phase 2** these `alsoAllow` grants, because Wave 0 is sequential:
     - `package.json` (scripts only)
     - `src/modules/acquisition/manifest.ts` (initial version)
     - `tests/factories/**`
     - `src/modules/acquisition/core/**`
     - `src/platform/directory/**`
   - Raise a change request so `CLAUDE.md` names this file as the machine-readable source of truth, and lists the new paths it contains.
2. **`scripts/ownership/guard.mjs`,** a plain Node script with no dependencies:
   - Reads the hook input from stdin.
   - Gets the target file path.
   - Works out the current phase from the git branch name `phase/<nn>-<slug>`.
   - If the branch isn't a phase branch (for example `main`, or merge work) or `FU_ALLOW_ALL=1` is set, it allows the edit.
   - Otherwise it allows the edit only if the path matches the phase's `owns`, its `alsoAllow`, or `alwaysAllowed`.
   - On a violation it blocks with the exit code the hooks docs specify, and a message:

     > "Phase <nn> does not own <path> (owner: Phase <mm>). Write the change you need to phases/<nn>/REQUESTS.md instead."
3. Register it as a `PreToolUse` hook in `.claude/settings.json`.
4. **Tests** for `guard.mjs` covering:
   - an owned path
   - a path owned by another phase
   - `alwaysAllowed`
   - a non-phase branch
   - `FU_ALLOW_ALL`
   - paths outside the repo
5. Add a CI check that fails if `ownership.json` contains a path claimed by two phases.

---

## Step 8: Parallel worktree helper

Write **`scripts/phase.mjs`**, run with `pnpm phase <command>`, so starting a parallel phase is one command.

- **`pnpm phase start <nn> <slug>`:**
  - Creates a git worktree at `../<repo-name>-<nn>-<slug>` on the branch `phase/<nn>-<slug>` from `main`.
  - Copies `.env.local`, then changes these in the copy:
    - `DATABASE_URL` points at a phase-specific database `futureuni_p<nn>`, cloned from `futureuni_dev` with `createdb -T` inside the Docker container (fall back to migrate + seed if cloning fails)
    - `PORT` = `3000 + nn`, so parallel dev servers never collide
    - the test database = `futureuni_test_p<nn>`
  - Runs `pnpm install`.
  - Creates `phases/<nn>/` in the worktree.
  - Prints the folder, branch, port and next command.
- **`pnpm phase list`:** active phase worktrees with their branch, port and whether they have uncommitted changes.
- **`pnpm phase finish <nn>`:** checks that `phases/<nn>/SUMMARY.md` exists and that `pnpm check` passes inside the worktree, then prints the merge steps from `phases/README.md`. It never merges automatically.
- **`pnpm phase remove <nn>`:** removes the worktree and drops the phase databases, after confirmation.
- Document these commands in `README.md`.

---

## Step 9: Testing setup (following saas-testing)

1. **Vitest:**
   - jsdom environment for `*.test.tsx`, node for `*.test.ts`
   - setup file in `tests/setup/`
   - path aliases
   - coverage configured but no percentage gate
   - MSW set up to **fail any unhandled network request**, which enforces "no real network calls in tests"
2. **Playwright:**
   - config with a `webServer` that runs the app with `MOCKS=true`
   - desktop (1440) and mobile (375) projects
   - an `@smoke` tag convention
   - one smoke test: the placeholder home renders, and switching the theme sets `data-theme="dark"`

   This environment may already have Chromium installed. Use the installed browser if one is configured, and don't download browsers when a local executable is available.
3. Example unit test and component test next to their code, showing the conventions.

---

## Step 10: CI

Create **`.github/workflows/ci.yml`** following saas-ship:

- Triggered on pull requests and pushes to `main`.
- A Postgres service container.
- Steps:
  1. pnpm install with cache
  2. lint
  3. typecheck
  4. test
  5. the ownership map duplicate check
  6. build with `MOCKS=true`
- Playwright smoke tests in a separate job.
- Migrations run in CI once Phase 2 exists. Guard the step so it's skipped when `prisma/schema` doesn't exist yet.

---

## Step 11: README

Write the root **`README.md`**:

- what the platform is
- prerequisites (Node, pnpm, Docker)
- first-time setup in five commands or fewer
- every script, with one line each
- how to run a phase and how to run phases in parallel (the `pnpm phase` commands)
- where the specs, rules, contracts and decisions live

---

## Constraints

- **No features:** no auth screens, no schema, no UI components beyond the placeholder, no business logic.
- **Don't change anything Phase 0 decided.** If something in Phase 0's documents is wrong or impossible, raise it in `phases/01/REQUESTS.md` with a proposed fix.
- **Verify, don't assume.** Configuration formats change, so check the docs for each tool.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] A fresh clone works end to end: `pnpm install` → `pnpm db:up` → `pnpm dev` shows the placeholder home with the correct fonts and brand colours, in both light and dark mode.
- [ ] `pnpm check` passes: lint, typecheck, test and build.
- [ ] `pnpm test:e2e` passes the smoke test on desktop and mobile.
- [ ] The lint fixtures test proves these rules fire: `any`, cross-module imports, the Anthropic SDK outside `platform/ai`, and raw hex colours.
- [ ] The Workflow proof ran (two steps, retry without re-running step 1). The results are in the summary and the throwaway files are deleted.
- [ ] The ownership guard blocks a disallowed edit on a `phase/*` branch and allows it on `main`. Its tests pass.
- [ ] `pnpm phase start 99 test` creates a working worktree with its own database and port, and `pnpm phase remove 99` cleans it up.
- [ ] `src/env.ts` fails fast with a readable message when a required variable is missing.
- [ ] Every ownership-map folder exists with a README.
- [ ] `.claude/settings.json` has both hooks, the saas-skills block in `CLAUDE.md` is filled, and project-rules "Stack and commands" is complete.
- [ ] CI workflow file exists and is valid.
- [ ] `phases/01/SUMMARY.md` (from the template) and `phases/01/REQUESTS.md` (change requests for Phase 0 files: `CLAUDE.md` table updates and anything else) are written.
- [ ] `saas-review` has been run on the full diff, with every Critical and Major finding fixed.
- [ ] End with a short report:
  - what was created
  - the verified tool versions
  - any differences from this prompt, and why
  - anything I must do by hand
