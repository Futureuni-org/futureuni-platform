# prisma/seed/

**Owner: Phase 02 (Core schema and registry).** The development seed (data-model §10): one curated,
invented dataset that makes every screen useful on day one. `pnpm db:seed` runs it; `pnpm db:reset`
runs it after re-applying the migrations.

## How it runs

`index.ts` refuses `NODE_ENV=production`, `VERCEL_ENV=production` and any database that isn't on
this machine (a preview branch needs both `SEED_ALLOW_REMOTE=1` and `VERCEL_ENV=preview`), and after connecting it checks that the server really is local. It then finds
`prisma/seed/seeders/*.ts` and every `src/**/seed.ts`, runs them in ascending `order`, each in its
own transaction, with one fixed `now` (`SEED_NOW=<ISO date>` pins it), and prints a row count for
every model.

A seeder is the default export of `defineSeeder({ name, order, run(tx, ctx) })` from
`@/platform/db`. Phase 2 uses orders 10–90:

| Order | Seeder | Writes |
|---|---|---|
| 10 | users | 8 users and team profiles (no passwords; Phase 3 seeds credentials) |
| 15 | platform | Settings, AI calls, the active prompt version, job runs, notifications, audit log, provider usage |
| 20 | profiles | One placeholder profile version per line (`seed:placeholder`) and 8 sequences |
| 30 | directory | 64 companies, their contacts, source refs and notes |
| 40 | leads | 76 leads with status trails, score reviews, the cross-sell group, capacity, saved searches, search runs, signals |
| 50 | audits | Audits, check runs, ~130 findings, cache entries, screenshots |
| 60 | outreach | Sending domains, mailboxes, daily stats, enrolments, messages, citations, delivery events |
| 70 | inbox | 16 replies, a correction, threads, answers |
| 80 | compliance | 5 suppressions, a consent record, 2 data-subject requests |
| 90 | pipeline | Meetings, proposals, deals, handoffs; then each person's `currentLoad` from active assignments |

A later phase adds its own seeder with an order after the rows it needs.

## Idempotency

Every row has a deterministic id (`lib/ids.ts`: `cseed` + a four-letter code + a padded number, 25
characters), and seeders upsert by id, so a second run leaves the same rows. Rows with a natural key
match on it first: users by email, companies by live domain, sending domains, mailboxes, source
refs, cache entries, files by key, suppressions by live (type, value), settings by (key, scope). When
such a row already exists under another id, the seed updates it and rewrites every reference
(`lib/context.ts`). Daily counters (mailbox stats, provider usage) are replaced, because their days
move with the calendar. A placeholder profile or prompt version is never written over a version
someone else published.

## Layout

| Path | What |
|---|---|
| `data/` | The curated fixtures: users, 64 companies, 76 lead specs with their status trails, the four initial profiles |
| `world/` | Builds the whole dataset in memory from the fixtures (pure, no database). `world.test.ts` checks it against §10, the contracts and the database rules |
| `seeders/` | Write the world, one area each |
| `lib/` | ids, relative time, the target guard, id remapping and upserts, fixture files, row counts |
| `fixtures/` | Small PNG, PDF and CSV files, copied to `.storage/seed/…` (the local storage driver's layout) |

Everything is invented: names, people, `.example` domains, UK drama-range and 555-01xx numbers. The
postal address setting is the marked placeholder `[DEV PLACEHOLDER] FUTUREUNI, 1 Example Street,
Lagos, Nigeria`; production starts with it empty (INV-4). No credentials are seeded.
