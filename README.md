# FUTUREUNI Internal Platform

FUTUREUNI's internal platform: one Next.js app, one PostgreSQL database, one login and one Vercel deployment, holding every internal tool as a **module** under `src/modules/<id>/`. The first module is **Client Acquisition**: it finds businesses that need web development, UI/UX design, graphic design or video editing, audits them, runs compliant outreach and tracks deals to won or lost. It's built in 22 phases (0–21), several of them in parallel worktrees.

## Prerequisites

- **Node.js 24** (see `.nvmrc`) and **pnpm 11** (`corepack enable`, or install pnpm 11.3 directly).
- **PostgreSQL 18**, either:
  - **native** (the build laptop's setup, ADR-004): a per-user install whose `bin` folder is on your PATH or in `LOCAL_PG_BIN`, with a data directory in `LOCAL_PGDATA` (see [Local database](#local-database)); or
  - **Docker**: any machine with `docker compose`; `docker-compose.yml` runs `postgres:18`.
- Git. On Windows, Git Bash is used by the Claude Code hooks.

## First-time setup

```bash
pnpm install
node scripts/env-init.mjs   # creates .env.local with fresh local secrets (never overwrites)
pnpm db:up                  # starts local PostgreSQL and creates futureuni_dev / futureuni_test
pnpm dev                    # http://localhost:3000
```

`MOCKS=true` is the default: every external provider uses its mock, so no API key is needed (ADR-005).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server on `PORT` from `.env.local` (3000 in the main folder, 3000 + phase number in a worktree) |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` / `pnpm lint:fix` | ESLint with the project rules (import boundaries, no raw colours, no `any` …) / auto-fix |
| `pnpm format` | Prettier, with Tailwind class sorting |
| `pnpm typecheck` | Generates Next.js route types, then `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest: unit, component and (from Phase 2) integration tests / watch mode |
| `pnpm test:e2e` | Playwright on a production build, desktop 1440px and mobile 375px; add `--grep @smoke` for the smoke suite |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL (native or Docker) |
| `pnpm db:migrate` | Create and apply a migration in development (`prisma migrate dev`, from Phase 2) |
| `pnpm db:generate` | Generate the Prisma client into `src/generated/prisma` |
| `pnpm db:seed` | Seed development data (idempotent) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | Drop, re-migrate and re-seed the development database (development only) |
| `pnpm mocks:on` / `pnpm mocks:off` | Switch `MOCKS` in `.env.local` (restart `pnpm dev`) |
| `pnpm phase …` | Parallel phase worktrees (below) |
| `pnpm check` | Everything CI runs: lint, typecheck, test, build |

Helpers without a package script: `node scripts/env-init.mjs` (first-time `.env.local`) and `node scripts/ownership/check.mjs` (the ownership map check).

## Local database

`LOCAL_DB_MODE` in `.env.local` chooses how `pnpm db:up` reaches PostgreSQL: `native`, `docker`, or empty (Docker when the `docker` command works, otherwise native).

**Native on Windows (no admin rights).** Download EDB's portable PostgreSQL 18 binaries (`postgresql-18.x-windows-x64-binaries.zip`), check the zip's SHA-256, and extract its `pgsql` folder to `%LOCALAPPDATA%\Programs\PostgreSQL\18`. Then create the data directory once (local development only; the password is `postgres`):

```powershell
$pg = "$env:LOCALAPPDATA\Programs\PostgreSQL\18\bin"
Set-Content -NoNewline "$env:TEMP\pgpw.txt" "postgres"
& "$pg\initdb.exe" -D "$env:LOCALAPPDATA\PostgreSQL\18\data" -U postgres --pwfile="$env:TEMP\pgpw.txt" -A scram-sha-256 -E UTF8 --locale-provider=builtin --builtin-locale=C.UTF-8 --locale=C
Remove-Item "$env:TEMP\pgpw.txt"
Add-Content "$env:LOCALAPPDATA\PostgreSQL\18\data\postgresql.conf" "listen_addresses = 'localhost'`ntimezone = 'UTC'`nlog_timezone = 'UTC'"
```

Those are the default paths; set `LOCAL_PG_BIN` and `LOCAL_PGDATA` in `.env.local` for any other location. `pnpm db:up` starts the server in its own hidden console, so closing a terminal doesn't stop it. It doesn't start with Windows: run `pnpm db:up` after a restart.

**Docker.** `pnpm db:up` runs `docker compose up -d --wait` (a named volume keeps the data) and `pnpm db:down` stops the container.

## Running a phase

Each phase has a prompt in `docs/prompts/`; the order and the parallel batches are in `docs/prompts/RUN-GUIDE.md` and `phases/README.md`. Every Claude Code session reads `CLAUDE.md` first, plans, and then builds only inside the paths its phase owns.

- **A sequential phase** runs on a branch in this folder: `git checkout main && git checkout -b phase/<nn>-<slug>`.
- **A parallel phase** gets its own worktree, database and port:

```bash
pnpm phase start 05 ai-service   # ../futureuni-platform-05-ai-service, branch phase/05-ai-service,
                                 # databases futureuni_p05 / futureuni_test_p05 (copied from the main ones), port 3005
pnpm phase list                  # phase worktrees, their ports, and whether they have uncommitted changes
pnpm phase finish 05             # checks phases/05/SUMMARY.md, that every changed path is phase 05's, and pnpm check; prints the merge steps (never merges)
pnpm phase remove 05             # removes the worktree, drops its databases and deletes the branch if it's merged (asks first; --yes skips)
```

Postgres can't copy a database while another session is connected to it, so stop `pnpm dev` and Prisma Studio in the main folder before `pnpm phase start`.

**The ownership guard.** On a `phase/<nn>-<slug>` branch, a Claude Code hook (`scripts/ownership/guard.mjs`) blocks edits to paths the phase doesn't own; the change goes into `phases/<nn>/REQUESTS.md` instead. Writes made through a shell don't reach the hook, so `node scripts/ownership/check.mjs --phase-diff` checks the whole branch diff (`pnpm phase finish` and CI run it). The map is `scripts/ownership/ownership.json` (the machine-readable copy of the `CLAUDE.md` table). On `main`, or with `FU_ALLOW_ALL=1`, every edit is allowed.

## Where things are

| What | Where |
|---|---|
| Rules, brand, permissions, invariants, bans | `.claude/project-rules.md` |
| Instructions for Claude Code, the ownership map | `CLAUDE.md` (machine-readable map: `scripts/ownership/ownership.json`) |
| Specs | `docs/specs/` (platform, Client Acquisition module, data model) |
| Contracts between parts | `docs/contracts/` |
| Decisions (ADRs) and the integrations register | `docs/decisions.md`, `docs/integrations.md` |
| Phase prompts, run guide | `docs/prompts/` |
| Phase summaries and change requests | `phases/` |
| Owner inputs (address, pricing, legal pack, brand drafts) | `docs/owner-inputs/`, `docs/legal/`, `docs/brand/` |
