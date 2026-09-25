# Phase 2: Core Schema, Contracts and Module Registry

> **How to run this phase**
> 1. Phase 1 must be merged into `main`, with its `REQUESTS.md` applied (`CLAUDE.md` names `scripts/ownership/ownership.json` as the ownership source).
> 2. Put this file at `docs/prompts/phase-02-core-schema.md`.
> 3. Run `git checkout -b phase/02-core-schema` and `pnpm db:up`.
> 4. Open Claude Code. Use Opus at maximum effort and switch to plan mode.
> 5. Say: **"Read docs/prompts/phase-02-core-schema.md and execute it. Plan first."**
> 6. When it's done, check the "Done when" list, then merge into `main`. After this merge, Wave 1 (Phases 3–6) can start in parallel.
>
> Wave 0, sequential. It depends on Phases 0 and 1. Every later phase depends on it.

---

## Your role and the goal of this phase

You are building the **shared foundation that every parallel phase builds against**. After this phase, nobody else touches the database schema or the contracts unless a change request is applied at merge time. So this phase must be **complete**: every table, enum, relation, index and interface that phases 3 to 21 need has to exist when you finish. If a later phase finds a missing field, a parallel build stalls. Be thorough.

This phase delivers:

1. **The complete Prisma schema** for the platform core and the Client Acquisition module, following `docs/specs/data-model.md` exactly. It includes the auth library's tables, so Phase 3 needs no schema changes.
2. **The initial migration,** plus database-level constraints for the invariants that SQL can enforce.
3. **A modular, idempotent seed** with realistic data for all four service lines in both markets, so every screen has data from its first day.
4. **`src/contracts/`:** every interface from `docs/contracts/`, as real TypeScript and Zod.
5. **The database client and shared data helpers:**
   - `src/platform/db/`
   - `src/platform/directory/`, for company and contact matching and dedupe
   - `src/modules/acquisition/core/`, for the lead state machine and the suppression check
6. **The module registry** with manifest discovery by code generation, validation, and navigation, permission and job aggregation, plus the platform-core manifest and the initial Client Acquisition manifest.
7. **The `create-module` template and generator.**
8. **Test data factories** for every model.

**The `saas-data` skill leads this phase.** Use `saas-testing` for the tests and `saas-review` at the end.

---

## Step 0: Read first

Read these in full before planning:

1. `CLAUDE.md`
2. `.claude/project-rules.md`, especially "Domain invariants", "Roles and permissions" and "Bans"
3. `docs/specs/data-model.md`, the source of truth for this phase
4. `docs/specs/platform.md`
5. `docs/specs/module-acquisition.md`
6. Every file in `docs/contracts/`
7. `docs/decisions.md`: the auth library, the retention period, and the Neon/Prisma adapter
8. `phases/README.md`, and `phases/00/SUMMARY.md` and `phases/01/SUMMARY.md`
9. `scripts/ownership/ownership.json`: confirm what Phase 2 owns and its `alsoAllow` grants
10. The global skills `saas-data` (and its references), `saas-auth` (only the parts about the tables the auth library needs) and `saas-testing`

Use Context7 to check the current docs for:

- Prisma: the multi-file schema, `prisma.config.ts` if the installed version uses it, driver adapters for Neon on Vercel, and preview features
- the chosen auth library's Prisma adapter and **its exact required models and fields**
- Vercel Workflow, only if the jobs contract needs types from it

If `data-model.md` and a library's required schema disagree (for example on the auth tables), the library wins for its own tables. Record the difference in your summary and in `phases/02/REQUESTS.md` so `data-model.md` gets updated.

---

## What this phase may edit

**It owns:**

- `prisma/**`
- `src/contracts/**`
- `src/platform/db/**`
- `src/platform/registry/**`
- `templates/create-module/**`

**It has these grants in `ownership.json`:**

- `package.json`, scripts only
- `src/modules/acquisition/manifest.ts`, the initial version only; Phase 19 owns it afterwards
- `tests/factories/**`
- `src/modules/acquisition/core/**`
- `src/platform/directory/**`

Anything else goes into `phases/02/REQUESTS.md`.

---

## Step 1: Prisma setup

1. Use **Prisma's multi-file schema** in `prisma/schema/`, with one file per area:

   | File | Contents |
   |---|---|
   | `_base.prisma` | Generator and datasource |
   | `enums.prisma` | Every shared enum |
   | `auth.prisma` | The auth library's models, exactly as its adapter requires |
   | `core.prisma` | Users and team, directory, notes, audit log, notifications, settings, credentials, AI usage, prompt versions, job runs, files |
   | `acquisition.prisma` | Every acquisition model, mapped to `acq_*` table names with `@@map` |

2. **Datasource:**
   - `DATABASE_URL`, pooled, for the app
   - `DIRECT_URL` for migrations
   - Configure the Neon serverless driver adapter the way the current Prisma and Neon docs recommend for Vercel, with standard TCP for local Docker. Both must work from the same code, selected by environment.
3. **Extensions** declared in the schema if the data model uses them: `pg_trgm` for fuzzy company-name matching, and `citext` for case-insensitive emails and domains.
4. Update `package.json` scripts if Phase 1's `db:*` scripts need adjusting for the multi-file schema or `prisma.config.ts`. You may add `db:validate` and `registry:gen`.

---

## Step 2: The schema

Translate `docs/specs/data-model.md` into Prisma **field by field**. Every model, field, type, nullability, default, relation, `onDelete` rule, unique constraint and index in the data model must appear.

**Conventions (from saas-data and project-rules):**

- `id String @id @default(cuid())`
- `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` on every model
- UTC everywhere
- Money is `Int` minor units plus a `currency` field (a `Currency` enum: `NGN`, `USD`, `GBP`, `EUR`, extendable)
- Enums for every finite state: `ServiceLine`, `Market`, `LeadStatus`, `Role`, `ReplyClass`, `MessageStatus`, `Channel`, `SuppressionType`, `EmailStatus`, `LegalForm`, `JobStatus` and so on, with the exact values from the spec
- An index on every foreign key and on every column the specs filter or sort by. At minimum:
  - `Lead(serviceLine, status)`
  - `Lead(market)`
  - `Lead(ownerId)`
  - `Lead(score)`
  - `Company(normalizedDomain)`
  - `Contact(email)`
  - `Message(status, scheduledFor)`
  - `Reply(classification)`
  - `LeadEvent(leadId, createdAt)`
  - `AiCall(createdAt, task)`
  - `JobRun(name, startedAt)`
- `deletedAt` only on the models the data model marks as soft-deleted
- **Encrypted credentials:** `IntegrationCredential` stores only ciphertext, IV and tag (or a single encrypted blob) plus key version. Never plaintext.

**Required coverage check.** Before you write the migration, produce a table in your plan listing every entity in `data-model.md` against its Prisma model, and every contract type against the model(s) that persist it. Nothing may be missing.

**Check these specifically**, because the parallel phases depend on them. Add anything the data model forgot, and record each addition in `REQUESTS.md`:

- **`TeamProfile`:** service lines (array or join table), weekly capacity, current load, timezone, and the `canApprove` flag.
- **`Lead`:**
  - company, service line, market, country
  - status, score, score reasons (JSON typed by a contract)
  - owner
  - brief
  - cross-sell group
  - the source signal(s)
  - `nextActionAt`
  - `snoozedUntil`
- **`Message`:**
  - channel, status, subject, body
  - cited finding IDs (a relation table, not just a JSON array, so invariant 5 can be checked)
  - `approvedById` and `approvedAt`
  - mailbox, `scheduledFor`, `sentAt`
  - the provider message ID, for reply threading
- **`Enrollment`:** status (`ACTIVE`, `PAUSED`, `STOPPED`, `COMPLETED`), current step, `nextRunAt`, `stoppedReason`.
- **`Mailbox` and `SendingDomain`:** daily cap, warm-up stage and start date, send-window settings, and health.
- **`Suppression`:** a type (`EMAIL`, `PHONE`, `DOMAIN`) plus a normalised value, unique per type and value.
- **`ServiceLineProfileVersion`:** the full profile JSON, validated by the contract schema at write time, a version number, `isActive`, and `createdById`.
- **`AiCall`:**
  - task, prompt version, model
  - input and output tokens
  - cost in minor units (USD)
  - latency, outcome
  - user or job reference
  - no prompt text beyond what the AI service contract allows
- **`JobRun`:**
  - name, idempotency key (unique), status
  - `startedAt`, `finishedAt`
  - attempt
  - error summary
  - counts JSON
- **`AuditLog`:** actor, action (named `module.resource.verb`), target type and ID, before/after JSON, and IP/user agent where applicable.
- **`Notification`:** user, type, title, body, link, `readAt`.

---

## Step 3: Migration and database-level invariants

1. Create the first migration with `pnpm db:migrate` (named `init`).
2. **Add raw SQL to the migration** for invariants Prisma can't express. Each one must have a comment naming the project-rules invariant it enforces:
   - **Invariant 9 (one active outreach thread per company):** a partial unique index on `Enrollment(companyId) WHERE status = 'ACTIVE'`. Denormalise `companyId` onto `Enrollment` if needed.
   - **Check constraints:**
     - money amounts ≥ 0
     - `Lead.score` between 0 and 100
     - `Mailbox.dailyCap` > 0
   - A partial unique index on `Lead(companyId, serviceLine, market)` for non-terminal statuses, **if the data model says** a company can't have two open leads for the same line and market.
   - A trigram index on `Company.name`, if `pg_trgm` is used.
3. Run `pnpm db:reset` from scratch and confirm the migration applies cleanly.
4. Run `prisma validate` and `prisma format`, and generate the client.

---

## Step 4: Database client and shared data helpers

### `src/platform/db/`

- **`client.ts`:**
  - One Prisma client singleton (safe for hot reload in development), marked `server-only`.
  - Uses the Neon adapter in serverless production and TCP locally.
  - Query logging in development only.
- **`transaction.ts`:** `withTransaction(fn)` with a sensible timeout, and a typed transaction client type (`Tx`) for helpers that must run inside a transaction.
- **`pagination.ts`:** the cursor pagination helper and its contract, following saas-data.
- **`errors.ts`:** maps Prisma known errors (unique violation, foreign key, not found) to the project's `AppError`.
- **`index.ts`:** the public exports. Other code imports the database only through here, or through `*.repo.ts` files.

### `src/platform/directory/` (the shared companies and contacts directory)

Both Sourcing (Phase 8) and Enrichment (Phase 9) write companies and contacts, so the matching logic must live in one place.

- **`normalize.ts`:**
  - `normalizeDomain(url)`: strips protocol, `www.`, paths and ports, and lowercases. It maps social or marketplace URLs (instagram.com, facebook.com, jiji.ng, linktr.ee and so on) to "no domain".
  - `normalizePhone(raw, defaultCountry)`: E.164 output. Choose a lightweight phone library and list it in the summary.
  - `normalizeEmail`
  - `normalizeCompanyName` (for comparison only)
- **`match.ts`:** `findMatchingCompany(tx, candidate)` using the dedupe order from the source-adapter contract:
  1. normalised domain
  2. normalised phone
  3. normalised name plus city, using trigram similarity above a threshold, if `pg_trgm` is enabled
- **`upsert.ts`:**
  - `upsertCompany(tx, candidate, source)` and `upsertContact(tx, companyId, candidate, source)`.
  - They merge new non-empty fields without overwriting verified data.
  - They record the source, the collection time and the lawful basis (invariant 10).
  - They return `{ record, created: boolean }`.
- Unit tests for every normaliser and each matching path, including tricky cases: `https://WWW.Example.com.ng/about`, an Instagram URL as the website, Nigerian numbers in `080…`, `+234…` and `234…` forms, and UK numbers.

### `src/modules/acquisition/core/` (the shared acquisition rules)

- **`lead-state.ts`:**
  - The allowed-transitions table, exactly as the module spec defines it.
  - `canTransition(from, to)`.
  - `transitionLead(tx, { leadId, to, actor, reason, meta })`, which:
    - checks the transition is allowed
    - updates the lead
    - writes the `LeadEvent` row in **the same transaction** (invariant 1)
    - returns the updated lead
    - throws a typed `AppError` on an invalid transition

  It **doesn't** emit notifications. It returns the event so callers (and Phase 6's event bus) can publish it.
- **`suppression.ts`:**
  - `isSuppressed(tx, { email?, phone?, domain? })` and `assertNotSuppressed(...)`, which throws.
  - Values are normalised with the directory normalisers.
  - This is the one function every send path must call (invariant 2).
- **`index.ts`:** the public exports.
- Tests:
  - every allowed transition succeeds
  - a sample of disallowed transitions fail
  - a `LeadEvent` is written in the same transaction, and a rollback leaves no event
  - suppression matches by email, phone and domain, including normalisation

---

## Step 5: Contracts (`src/contracts/`)

Turn every file in `docs/contracts/` into TypeScript and Zod. **Don't redesign them.** If something is impossible to type as written, implement the closest correct version and record the difference in `REQUESTS.md`.

- **One file per contract:**
  - `module-manifest.ts`
  - `service-line-profile.ts`
  - `source-adapter.ts`
  - `enrichment.ts`
  - `audit-agent.ts`
  - `ai-service.ts`
  - `jobs.ts`
  - `outreach-channel.ts`
  - `permissions.ts`
  - `events.ts`
- **Shared primitives** in `common.ts`:
  - `ServiceLine`, `Market` and the other enums, re-exported from the Prisma enums, so there's one source of truth
  - `Money` plus `formatMoney` / `toMinor` / `fromMinor`, supporting ₦, $, £ and €
  - `CountryCode`
  - `Iso8601`
  - the `Actor` type (a user or a system job)
- **Zod first:** types are derived with `z.infer`.
- **Interfaces with behaviour** (adapters, agents, the AI service) are TypeScript interfaces, with Zod schemas for their inputs and outputs.
- Contracts contain **no implementations** and **no imports from `src/platform` or `src/modules`**. They may import only Zod, `@prisma/client` enums, and each other.
- **`index.ts`** re-exports everything.
- **Tests:** for each contract, the worked example from its `docs/contracts/` file parses successfully, and one invalid example fails with the expected issue. Use `expectTypeOf` type tests for the key interfaces.

---

## Step 6: The module registry (`src/platform/registry/`)

1. **Discovery by code generation.** Next.js can't glob modules at runtime, so write `src/platform/registry/codegen.ts` (run it with `pnpm registry:gen`). It:
   - finds every `src/modules/*/manifest.ts`
   - writes `src/platform/registry/generated.ts`, which imports each manifest statically, sorted by module ID
   - runs automatically before `dev`, `build`, `typecheck` and `test`, via `pre*` scripts in `package.json`
   - `generated.ts` is committed, and CI fails if it's stale
2. **`registry.ts`:**
   - `getAllModules()` validates every manifest with the `ModuleManifest` Zod schema.
   - `getEnabledModules()` respects the manifest's `enabled` flag, overridden by a `Setting` row `module.<id>.enabled`.
   - `getNavigation(user)` returns the navigation tree, filtered by the user's permissions through the permissions contract's `can()` signature. Accept a `can` function as a parameter, since Phase 3 implements it.
   - `getAllPermissions()` returns the core actions plus every module's actions.
   - `getAllJobs()` and `getCronSchedules()`. Phase 6 uses these to build `vercel.json` crons and register workflows.
   - `getSettingsPanels()` and `getHomeWidgets()`.
3. **Validation at generation time.** Code generation fails with a clear message on:
   - duplicate module IDs
   - overlapping route prefixes
   - duplicate permission action names
   - duplicate job names
   - an invalid cron expression
   - a navigation link outside the module's route prefix
4. **`core-manifest.ts`,** the platform's own manifest:
   - navigation: Home, Settings, Admin (Admin visible to `ADMIN` only)
   - the core permission actions from project-rules
   - no jobs yet (Phase 6 adds them through a change request)
5. **`src/modules/acquisition/manifest.ts`,** the initial version (Phase 19 owns it afterwards):
   - `id: "acquisition"`, name "Client Acquisition", route prefix `/acquisition`
   - navigation: Overview, Web Development, UI/UX Design, Graphic Design, Video Editing, each tab with its sections (Search, Review, Pipeline, Inbox, Analytics, Settings) as children
   - **every acquisition permission action** from the project-rules permission matrix
   - an empty jobs list
   - placeholder home widgets: "My review queue", "My inbox", "Pipeline value"
6. **Tests:**
   - code generation picks up a temporary test module and rejects each invalid case above
   - navigation filtering hides entries the user lacks permission for
   - a disabled module disappears

---

## Step 7: The `create-module` template and generator

1. **`templates/create-module/`** is a complete, minimal module skeleton with tokens such as `__MODULE_ID__`, `__MODULE_NAME__` and `__ROUTE_PREFIX__`. It contains:
   - `manifest.ts`
   - `README.md`
   - `core/` (domain logic plus an example `*.repo.ts`)
   - `ui/` (an example component)
   - an example page for `src/app/(platform)/<prefix>/page.tsx`
   - an example job definition following the jobs contract
   - an example `seed.ts`
   - an example test
   - a `SPEC_TEMPLATE.md` to copy into `docs/specs/module-<id>.md`
2. **`scripts/create-module.ts`** (run with `pnpm create-module <id> "<Name>"`):
   - validates the ID (kebab-case, unused)
   - copies the template into `src/modules/<id>/` and the page into `src/app/(platform)/<id>/`
   - replaces the tokens
   - runs `registry:gen`
   - prints the next steps: write the spec, add an ownership entry, and add a Prisma schema file `prisma/schema/<id>.prisma` with a `<id>_` table prefix

   `scripts/` is owned by Phase 1, so put the script at `src/platform/registry/create-module.ts` and add the `create-module` package script (you have the `package.json` grant).
3. **Test it:**
   - generate a throwaway `sandbox` module
   - confirm `registry:gen`, `typecheck` and `build` pass and the Sandbox navigation entry appears in `getNavigation()`
   - delete it again
   - record the result

---

## Step 8: Seed and factories

### Factories (`tests/factories/`)

- One factory per model, built with `@faker-js/faker` using a fixed seed:
  - it gives sensible defaults
  - it accepts overrides
  - it creates the required relations
- Examples: `buildCompany`, `createCompany(tx, overrides)`, `createLeadWithAudit(tx, { serviceLine, market, status })`.
- Later phases use these in their tests, so write clean, well-typed APIs and document them in `tests/factories/README.md`.

### Seed (`prisma/seed/`)

- **A modular runner.** `prisma/seed/index.ts` discovers seeders by glob: `prisma/seed/seeders/*.ts` and `src/**/seed.ts`.
  - Each seeder exports `{ name, order, run(tx, ctx) }` and runs in `order`.
  - This lets later phases add their own `seed.ts` in their own folder (for example Phase 3 seeding login credentials) without editing this runner.
- **Idempotent.** Running `pnpm db:seed` twice produces the same data: use upserts on natural keys. It refuses to run when `NODE_ENV=production`.
- **The seed data follows the seed plan in `data-model.md`.** At minimum:
  - **Users:** one per role (`ADMIN`, `MANAGER`, a `SERVICE_LEAD` for each of the four service lines, two `MEMBER`s), with team profiles, capacities and timezones. Use `@futureuni.local` emails. No passwords; Phase 3 seeds credentials.
  - **Active profile versions:** a `ServiceLineProfileVersion` for each line, from the initial profiles in the module spec. Every profile must pass the `ServiceLineProfile` schema.
  - **Companies:** about 60, spread across Nigeria (Lagos, Abuja, Port Harcourt, Warri, Benin City) and international (the UK, US, Ireland, Canada), with realistic names, sectors and legal forms. Include:
    - UK sole traders, to exercise the PECR rule
    - companies with no website, to exercise the web development signal
    - one company that qualifies for two lines, to exercise cross-sell
  - **Leads** across **every** `LeadStatus`, for all four lines and both markets, with signals, audits and findings. Findings have evidence and source URLs using `example.com`-style domains.
  - **Messages:** drafts, approved and sent, each citing findings.
  - **Replies** of **every** `ReplyClass`.
  - **Suppressions:** one each for email, phone and domain.
  - Mailboxes and sending domains in different warm-up stages.
  - Meetings, proposals, and won and lost deals in NGN, USD and GBP.
  - A few `AiCall` and `JobRun` rows, so the admin screens have data.
- At the end, print a summary table: rows per model.

---

## Step 9: Verify everything

Run each of these and report the results:

1. `pnpm db:reset`: the migration applies and the seed completes.
2. `pnpm db:seed` a second time: the row counts are unchanged.
3. `pnpm registry:gen`: no diff afterwards.
4. `pnpm check`: lint, typecheck, test and build pass.
5. **SQL-level checks** that each prove a constraint:
   - inserting a second `ACTIVE` enrollment for the same company fails
   - a score of 101 fails
   - a negative money amount fails
6. `saas-review` on the full diff, with every Critical and Major finding fixed.

---

## Constraints

- **Don't change Phase 0 contracts or specs directly.** Differences go in `phases/02/REQUESTS.md`, with the exact proposed edit.
- **No UI, no auth logic, no business workflows.** Only data, contracts, the registry, templates, seed and factories.
- **No destructive migration patterns.** This is the initial migration, so a clean `init` is expected.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The coverage table shows every data-model entity and every contract type mapped. Nothing is missing.
- [ ] `prisma/schema/` is multi-file, the migration applies from scratch, and the SQL constraints for invariants 9, score range and money are proven.
- [ ] `src/platform/db/`, `src/platform/directory/` and `src/modules/acquisition/core/` exist with tests covering normalisation, matching, upserts, lead transitions (including rollback) and suppression.
- [ ] `src/contracts/` implements every contract. The worked examples parse; invalid examples fail.
- [ ] The registry codegen works, validates manifests, and CI catches a stale `generated.ts`. `core-manifest.ts` and the initial acquisition manifest exist, and the acquisition manifest contains every acquisition permission.
- [ ] `pnpm create-module` generated, built and removed a sandbox module successfully.
- [ ] The seed is idempotent, covers every lead status and reply class in both markets and all four lines, and prints row counts.
- [ ] Factories exist for every model, documented in `tests/factories/README.md`.
- [ ] `pnpm check` passes.
- [ ] `phases/02/SUMMARY.md` is written. Its "Public interfaces" section lists every export the Wave 1–3 phases will use: db, directory, acquisition core, contracts, registry and factories.
- [ ] `phases/02/REQUESTS.md` lists every required update to Phase 0 documents: data-model additions, auth-table differences and contract adjustments.
- [ ] End with a short report:
  - what was created
  - the row counts
  - schema additions beyond `data-model.md`, and why
  - anything I must do by hand
