# Phase 02: Core schema, contracts and registry: Summary

| | |
|---|---|
| Phase | 02, Core schema, contracts and registry |
| Branch | `phase/02-core-schema` |
| Batch / wave | B0 / Wave 0 (sequential: 0 → 1 → 2) |
| Date finished | 2026-09-26 |
| Prompt | `docs/prompts/phase-02-core-schema.md` |
| Verification | `pnpm check`: Pass (38 test files, 450 tests, build) · `pnpm test:e2e`: Not run (no new routes; the Phase 1 smoke test is unchanged) · `saas-review`: 1 Critical and 16 Major found and fixed; no open Critical/Major |

## What was built

The whole data foundation every later phase builds on:

- **Schema:** the Prisma 7 multi-file schema (63 models, 70 enums) matching `docs/specs/data-model.md`, and the `init` migration. The migration creates the `citext` and `pg_trgm` extensions and every CHECK constraint (§6), each commented with its invariant. Partial unique indexes are native, so Prisma tracks them.
- **Helpers:** the database client and helpers (`@/platform/db`), the shared company and contact directory (`@/platform/directory`), and the lead state machine and suppression check (`@/modules/acquisition/core`).
- **Contracts:** every contract in `docs/contracts/` as TypeScript and Zod (`@/contracts`), plus the money helpers.
- **Registry:** the module registry with codegen and validation, the core and acquisition manifests, and `pnpm create-module`.
- **Test data:** factories for every model, and an idempotent development seed of 2,219 rows (data-model §10).

**Constraints proven in SQL:**
- a second ACTIVE enrolment for a company is refused (`acq_enrollments_one_open_thread`, INV-9);
- a score of 101 is refused (`acq_leads_score_range`);
- negative money is refused (`acq_proposals_money_nonnegative_check`, `acq_deals_value_nonnegative_check`).

## Files and folders created

| Path | Purpose |
|---|---|
| `prisma.config.ts` | Prisma 7 config: schema folder, migrations, seed command, `DIRECT_URL` (loads `.env.local`, then `.env`) |
| `prisma/schema/*.prisma` | `_base` (generator with `partialIndexes`), `enums`, `auth` (Better Auth), `core`, `acquisition` |
| `prisma/migrations/20260926091335_init/` | The initial migration, with extensions and CHECK constraints |
| `prisma/tools/` | `generate.mjs` (generate only when the schema changed), `validate.mjs` (drift check), `reset.mjs` (local reset + seed), `prisma-cli.mjs` |
| `prisma/schema.test.ts`, `prisma/constraints.test.ts` | Schema = data model (every enum, model, field, index); SQL proofs of the CHECKs and partial uniques |
| `prisma/seed/` | Runner, curated data, pure world builder (+ test), seeders, fixtures, README |
| `src/platform/db/` | Client, soft delete, transactions and savepoints, pagination, error mapping, JSON input, seeder API |
| `src/platform/directory/` | Normalisers, matching, company and contact upserts |
| `src/modules/acquisition/core/` | `transitionLead`, lifecycle table, suppression check |
| `src/contracts/` | All 12 contracts, fixtures and tests |
| `src/lib/money.ts` | `formatMoney`, `toMinor`, `fromMinor` (grant) |
| `src/platform/registry/` | `define`, `validate`, `codegen`, `generated.ts`, `registry`, `core-manifest`, `create-module` |
| `src/modules/acquisition/manifest.ts` | The initial acquisition manifest (Phase 19 owns it from here) |
| `templates/create-module/` | The module template and `SPEC_TEMPLATE.md` |
| `tests/factories/` | A factory for every model, `withRollback`, test-database guard, README |

## Public interfaces other phases can use

```ts
// @/platform/db  (server-only)
export const db;                     // Prisma client; Company/Contact/FileObject reads skip soft-deleted rows
export const dbIncludingDeleted;     // unscoped: DSRs, retention purge, restore only
export function disconnectDb(): Promise<void>;
export type Db; export type Tx;      // Tx = the transaction client; helpers that need a transaction take it first
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeoutMs?; maxWaitMs?; isolationLevel? }): Promise<T>; // 10 s default
export function dbOr(tx: Tx | null): Tx;
export function withSavepoint<T>(tx: Tx, fn: () => Promise<T>): Promise<T>; // survive an expected unique violation inside a transaction; nests safely
export function createOrOnConflict<T>(tx: Tx, constraint: string, create: () => Promise<T>, onConflict: () => Promise<T>): Promise<T>; // the way to "upsert" on a partial unique index (see src/platform/db/README.md)
export function paginate<T extends { id: string; createdAt: Date }>(input: CursorPageInput, fetch: (q: { after: Cursor | null; take: number }) => Promise<T[]>): Promise<Page<T>>;
export function afterClause(after: Cursor | null); export const NEWEST_FIRST; // where: { AND: [filters, afterClause(after)] }, orderBy [createdAt desc, id desc]
export function encodeCursor(c: Cursor): string; export function decodeCursor(s?: string | null): Cursor | null;
export const MAX_PAGE_SIZE = 100; export const DEFAULT_PAGE_SIZE = 25;
export function toDbAppError(e: unknown): AppError | null;   // unique/FK → CONFLICT, CHECK/NOT NULL → VALIDATION_FAILED, missing → NOT_FOUND; the constraint name only on the sanitised cause
export function rethrowDbError(e: unknown): never;
export function isUniqueViolation(e: unknown, constraint?: string): boolean;
export function violatedConstraint(e: unknown): string | null; export function sqlState(e: unknown): string | null;
export function toJsonInput(value: unknown): Prisma.InputJsonValue;
export function defineSeeder(s: Seeder): Seeder; export interface Seeder { name; order; run(tx, ctx: SeedContext) }
export { Prisma }; // and every model type (Lead, Company, …)

// @/platform/directory  (server-only)
export function normalizeDomain(url: string): string | null;         // registrable domain; null for social/marketplace hosts
export function classifyWebsite(url: string | null): WebsiteKind;
export function normalizePhone(raw: string, defaultCountry?: string | null): string | null; // E.164
export function normalizeEmail(raw: string): string | null; export function emailDomain(email: string): string | null;
export function normalizeCompanyName(name: string): string;
export function findMatchingCompany(tx: Tx, candidate: CompanyMatchCandidate, opts?: { nameThreshold? }): Promise<{ company; matchedBy } | null>;
export function upsertCompany(tx: Tx, candidate: CompanyCandidate, source: DirectorySource, opts?): Promise<{ record: Company; created: boolean; matchedBy }>; // Places: pass searchLocation
export function upsertContact(tx: Tx, companyId: string, candidate: ContactCandidate, source: DirectorySource): Promise<{ record: Contact; created: boolean }>;

// @/modules/acquisition/core  (server-only)
export function transitionLead(tx: Tx, input: { leadId; to: LeadStatus; actor: Actor; reason?; meta?; nurtureReason?; clock? }): Promise<{ lead: Lead; event: LeadEvent | null }>;
export function recordLeadCreation(tx: Tx, …): Promise<LeadEvent>;
export function canTransition(from: LeadStatus, to: LeadStatus, lead?: { nurtureReason? }): boolean;
export const LEAD_TRANSITIONS, NURTURE_REASONS_FROM, LEAD_CLOSED_STATUSES, LEAD_TERMINAL_STATUSES, LEAD_PRE_CONTACT_STATUSES, LEAD_ACTIVE_STATUSES;
export function isOpenLeadStatus(s: LeadStatus): boolean; export function leadEventActor(actor: Actor);
export function findSuppressions(tx: Tx | null, check: { email?; phone?; domain?; defaultCountry? }): Promise<SuppressionMatch[]>;
export function isSuppressed(tx: Tx | null, check): Promise<boolean>;
export function assertNotSuppressed(tx: Tx | null, check): Promise<void>; // throws SUPPRESSED { types }; VALIDATION_FAILED for an unreadable email or phone (fails closed)
export function hashSuppressionValue(normalized: string): string;     // HMAC-SHA256 with SUPPRESSION_HASH_KEY
export function normalizeSuppressionValue(type: SuppressionType, raw: string, defaultCountry?): string | null;

// @/contracts: every schema and type in docs/contracts/*.md (see src/contracts/README.md)
// @/lib/money: formatMoney(money, opts?), toMinor(amount: string, currency), fromMinor(minor, currency)

// @/platform/registry  (server-only)
export function getAllModules(); export function getEnabledModules(opts?: { readSettings? });
export function getNavigation(user: { id?; can(action, resource?) }, opts?: { modules? }): Promise<{ module; items: NavItem[] }[]>;
export function mayOpen(user, action, resource?): boolean; // allowed, or allowed on the user's own records (OWN scopes)
export function getAllPermissions(); getAllJobs(); getCronSchedules(); getDynamicScheduleProviders();
export function getSettingDefinitions(); getSettingsPanels(); getHomeWidgets(); getNotificationTypes();
export function getCommands(); getAllAiTasks(); getAllSubscribers(); resolveBadge(source, ctx);
// @/platform/registry/define (for manifests): defineModule, defineJob, defineSubscriber, defineSetting, permission, scopes
```

**Factories** (`tests/factories`, see its README): `build<Model>` and `create<Model>(tx, overrides)` for every model; `withRollback`, `createTeamMember`, `createLeadInStatus`, `createLeadWithAudit`, `buildValidProfile`, `upsertLineCapacityState`, `FIXED_NOW`, `fixedClock`, `daysAgo`.

**Commands:**
- `pnpm db:deploy` · `pnpm db:validate` · `pnpm db:reset` · `pnpm db:seed`
- `pnpm registry:gen [--check]` · `pnpm create-module <id> "<Name>"`

**Registered:**
- permissions: 37 `platform.*` (core manifest) and 57 `acquisition.*` (the full project-rules matrix);
- navigation: Home, Settings, Admin; the acquisition Overview; 4 line tabs × 7 sections;
- 3 placeholder home widgets.
- No jobs, events, settings or AI tasks yet (later phases add them to the manifests).

## Decisions made (and any new ADRs proposed)

- **One driver path (ADR-019):** `@prisma/adapter-pg` over a `pg` Pool everywhere, with `attachDatabasePool` on Vercel. The prompt's separate "Neon serverless adapter" isn't used.
- **INV-9 index** covers ACTIVE **and** PAUSED enrolments (ADR-032), not ACTIVE only.
- **Partial unique indexes:** declared natively with the `partialIndexes` preview feature, predicates in PostgreSQL's stored form. That's why `db:validate` shows no drift. CHECK constraints live in migration SQL.
- **Settings uniqueness:** two partial uniques + a CHECK, instead of the COALESCE expression index (CR-02-02).
- **`LeadEvent.actorLabel`** added (CR-02-01).
- **Foreign keys:** every one has an index (CR-02-03).
- **AI cost:** `AiCall.costMicros` is micro-USD (ADR-027).
- **Admin navigation:** Admin is gated by `platform.admin.access` (ADMIN and MANAGER).
- **Acquisition navigation:** 7 sections per line tab, including Leads. The Overview shows for anyone allowed on any line (CR-02-15).
- **Money:** `src/lib/money.ts` holds the helpers; `common.ts` holds only types and re-exports the error map.
- **Code generation:** `predev`/`prebuild`/`pretypecheck`/`pretest` generate the Prisma client (only when the schema changed) and the registry, so a fresh clone and Vercel build without a manual step.
- **The seed** is a pure in-memory "world" (fixed ids, times relative to `now`), checked by a unit test, then written by ten seeders. Natural keys are matched first, and references are remapped.
- **Module ids:** letters only (CR-02-14). Module display names are limited to characters that need no escaping.
- **Fixed after review (saas-review, five parallel reviewers):**
  - **Critical:** businesses on shared hosts and listing sites (`acme.wordpress.com`, `fresha.com/a/…`) were given the host's domain, so different businesses merged. Site-builder subdomains are now the business's own domain, and pages on a listing host have no domain.
  - **Major, database:**
    - nested savepoints now roll back only their own work;
    - the cursor is ANDed with filters (a spread dropped a filter's own `OR`);
    - the partial-unique upsert trap is documented, with a `createOrOnConflict` helper.
  - **Major, contracts:** events can't pair a name with another event's payload; subscribers register without casts; workflow job entries stay the same function.
  - **Major, registry:** members see Review and Inbox for their own leads; a fresh clone generates the client before lint (`postinstall`, `prelint`).
  - **Major, directory:**
    - a similar name in the same city no longer merges businesses whose domains or phones differ;
    - Places companies keep only the search's location (INV-14);
    - a changed email resets its verification.
  - **Major, lead rules:** nurture reasons are checked against the starting status; a contacted lead can't return to SCORED.
  - **Major, money:** amounts are formatted entirely with `Intl`.
  - **Major, seed:**
    - the guard can't be bypassed with `SEED_ALLOW_REMOTE` or a `?host=` URL, and it checks the server it actually reached;
    - Nigerian leads get no cold email and carry `complianceReview` (INV-25);
    - the UK sole trader's consent predates the first email (INV-6);
    - only approvers approve;
    - no Places-only data is stored (INV-14);
    - a fulfilled deletion keeps only a hash.
  - **Minor fixes:**
    - compact money rollover, and `toMinor` grouping;
    - more manifest validation checks;
    - the extension-aware phone parser;
    - the suppression check fails closed;
    - factory collisions, and unmatched replies and meetings;
    - names aligned with the spec.
  - **Minor items left for later phases:** CR-02-21.

## Dependencies added

| Package | Version | Why |
|---|---|---|
| `libphonenumber-js` | 1.13.14 | E.164 phone normalisation for Nigerian and UK numbers |
| `tldts` | 7.4.15 | Registrable domain via the Public Suffix List, including private suffixes (`acme.myshopify.com` stays distinct) |
| `croner` | 10.0.1 | Validating 5-field cron expressions in manifests at codegen |

## Change requests raised

| ID | Type | Summary |
|---|---|---|
| CR-02-01 | schema doc | Add `LeadEvent.actorLabel` |
| CR-02-02 | schema doc | Settings uniqueness as two partial uniques + CHECK |
| CR-02-03 | schema doc | 47 foreign-key indexes the tables didn't list |
| CR-02-04 | schema doc | Better Auth 1.7.6 table notes for Phase 3 |
| CR-02-05 | schema doc | The int4 money ceiling (₦21.47m per amount) |
| CR-02-06 | seed plan | Numbers §10 itself forces (12 two-lead companies, 16 assignments, findings, meetings, seeder orders) |
| CR-02-07 | spec | §5.2 diagram edges IN_REVIEW/APPROVED → NURTURE not in the table (decision) |
| CR-02-08 | contract doc | permissions.md example id with an upper-case letter |
| CR-02-09 | contract docs | Transcription changes (IdSchema regex, `unknown` generics, cache.get, seam `tx`, SequenceStepPurposeSchema) |
| CR-02-10 | CI | `registry:gen --check`, `db:deploy`, `db:validate` steps |
| CR-02-11 | config | Vitest globalSetup that migrates the test database |
| CR-02-12 | config | `@/tests/*` path alias |
| CR-02-13 | rules | Database command rows; Prisma's AI consent gate for `migrate reset` |
| CR-02-14 | spec | Module ids are letters only |
| CR-02-15 | contract doc | The any-line navigation rule |
| CR-02-16 | notes | For Phase 6: `defineJob` keeps workflow entries; `.storage/<key>` layout |
| CR-02-17 | contract docs | Review type fixes: distributive `NewEvent`, `AnySubscriberDefinition` and `defineSubscriber`, the workflow `entry` method |
| CR-02-18 | contract doc | Google Places candidates carry `searchLocation`; the listing's city isn't stored (INV-14) |
| CR-02-19 | rules | Never upsert or findUnique through a partial unique index |
| CR-02-20 | ownership | Record the package.json scripts Phase 2 added beyond its named ones |
| CR-02-21 | notes | Review items for Phases 4, 5, 6, 9 and 19 |
| CR-02-22 | ownership | Let every phase change `pnpm-lock.yaml` (dependencies are allowed) |

**Seams:** none in this phase.

## Known limitations

- **`pnpm db:reset` wasn't run by me.** Prisma 7 refuses `migrate reset` from an AI agent without the user's consent. The same path was verified instead on a throwaway local database: `prisma migrate deploy` from empty, then the seed twice, 2,219 rows both times, then dropped.
- **`futureuni_dev` needs `pnpm db:reset` once.** It holds rows from the seed as it was before the review fixes. The second seed version's deterministic ids point at different content, so `pnpm db:seed` there stops with a unique-index error until the database is reset. The seed is idempotent within one version, and the fresh-database check proves it.
- **Seed placeholders:**
  - the four service-line profiles are `seed:placeholder` (prices from module spec §3.3, `needsReview: true`, placeholder portfolio items; Phase 7 replaces them);
  - `platform.postalAddress` is the marked dev placeholder;
  - no credentials are seeded.
- **Nothing emits events yet:** `transitionLead` returns the event row, and Phase 6 adds the outbox publishing.
- **Money** is capped at int4 per amount (CR-02-05).
- **Tests and the test database:** they import factories by relative path until CR-02-12, and the test database must already be migrated until CR-02-11.

## How to test it

- **Database:** `pnpm db:up`, then `pnpm db:reset` (or `pnpm db:deploy && pnpm db:seed`). The seed prints a row count for every model; a second `pnpm db:seed` gives the same counts.
- **Checks:** `pnpm db:validate` (no drift), `pnpm registry:gen --check` (up to date), `pnpm check`.
- **Seeded users:** `admin@futureuni.local` (ADMIN), `manager@…`, `web.lead@…`, `uiux.lead@…`, `graphic.lead@…`, `video.lead@…`, `kelechi@…`, `zainab@…` (no passwords until Phase 3).
- **Seeded data:**
  - team loads 0/2/3/4/4/1/1/1;
  - line capacity: Graphic Design PAUSED, UI/UX SLOW;
  - the cross-sell company is Adunni Bakes & Events Ltd;
  - the active client is Delta Care Clinic Ltd.
- **A new module:** `pnpm create-module sandbox "Sandbox"`, then `pnpm check`. Delete `src/modules/sandbox` and `src/app/(platform)/sandbox` and run `pnpm registry:gen`.
