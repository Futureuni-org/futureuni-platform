# prisma/

**Owner: Phase 02 (Core schema and registry).** The Prisma 7 schema, migrations and development
seed (ADR-019). Only `src/platform/db/**`, `prisma/**` and `*.repo.ts` files may import the client.

| Path | What |
|---|---|
| `schema/` | The multi-file schema: `_base.prisma` (generator, datasource), `enums.prisma` (every enum in data-model §3), `auth.prisma` (Better Auth tables), `core.prisma` (platform core), `acquisition.prisma` (`acq_` tables) |
| `migrations/` | SQL migrations. `init` also creates the `citext` and `pg_trgm` extensions and every CHECK constraint, each commented with its data-model §6 number and invariant |
| `seed/` | The development seed (see `seed/README.md`); `seed/staging/` belongs to Phase 19 |
| `tools/` | `generate.mjs` (generates the client when the schema changed), `validate.mjs` (`pnpm db:validate`), `reset.mjs` (`pnpm db:reset`) |
| `schema.test.ts` | Checks the schema against data-model.md §3 and §5: every enum, model, field, type, default and index |
| `constraints.test.ts` | Proves the database refuses what the CHECKs and partial unique indexes forbid (INV-9, money, scores, citations, …) |

## Commands

- `pnpm db:migrate --name <change>`: a new migration from a schema edit (development). Read the SQL.
- `pnpm db:deploy`: apply pending migrations (CI, preview and production).
- `pnpm db:validate`: `prisma validate`, then a drift check that replays the migrations into a
  throwaway local database and fails when the schema and migrations disagree.
- `pnpm db:reset`: local only; drops the database, re-applies every migration, regenerates the
  client and seeds. Prisma 7 no longer seeds or generates on reset, so the script does both.
  Prisma refuses `migrate reset` when an AI agent runs it without the user's consent.
- `pnpm db:seed`: the development seed (idempotent).

## Conventions

- Tables are snake_case plurals (`@@map`); acquisition tables start with `acq_`. Ids are cuid,
  timestamps `timestamptz(3)` in UTC, date-only values `date`, emails and domains `citext`.
- Partial unique indexes are declared natively (`@@unique(..., where: raw("..."))`, the
  `partialIndexes` preview feature), so later migrations never drop them. Write a predicate the way
  PostgreSQL stores it (`status <> ALL (ARRAY[...])`, not `NOT IN (...)`), or every later diff shows
  drift.
- CHECK constraints live only in migration SQL (Prisma doesn't model them). Add new ones in the
  migration that needs them, commented with the invariant.
