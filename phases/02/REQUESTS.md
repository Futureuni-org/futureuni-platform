# Phase 02: Change requests

Changes Phase 2 needs in files it doesn't own. Apply them on `main` at merge time. Each has an ID, type, target, the exact change and the reason.

No seams: Phase 2 has none.

---

## CR-02-01 · schema doc · `docs/specs/data-model.md` §5.2 LeadEvent

Add a row after `actorId`:

> `| actorLabel | String | yes | — | The job name for SYSTEM actors (for example "acquisition.scoring.lead"), mirroring AuditLog.actorLabel |`

**Reason:** without it a lead's history can't say which job moved it (`actorId` is null for SYSTEM actors). `transitionLead` fills it from `Actor.job`. `prisma/schema.test.ts` allowlists this one addition.

## CR-02-02 · schema doc · `docs/specs/data-model.md` §5.1 Setting and §6 #17

1. In Setting's **Indexes** line, replace "unique on (`key`, `scope`, COALESCE(`userId`, '')) (raw SQL, §6)" with:

   > unique on (`key`, `scope`) WHERE `userId` IS NULL; unique on (`key`, `scope`, `userId`) WHERE `userId` IS NOT NULL (both partial, declared in the schema); CHECK `("scope" = 'USER') = ("userId" IS NOT NULL)`

2. Replace row 17 of the §6 table with:

   > `| 17 | Settings uniqueness incl. null user | Two partial unique indexes, settings_key_scope_global_key (key, scope) WHERE "userId" IS NULL and settings_key_scope_user_key (key, scope, "userId") WHERE "userId" IS NOT NULL, plus CHECK settings_user_scope_check (("scope" = 'USER') = ("userId" IS NOT NULL)) | Settings contract |`

**Reason:** the same guarantee as the COALESCE expression index, but Prisma Migrate can declare and track partial indexes (the `partialIndexes` preview feature). A raw expression index is invisible to Prisma, so a later `migrate dev` would try to drop it. The CHECK also stops a USER-scoped row without a user, or a PLATFORM row with one.

## CR-02-03 · schema doc · `docs/specs/data-model.md` §5 (index lines)

Add these foreign-key indexes to the entities' **Indexes** lines (they're in the schema already; §2 says every foreign key has one):

- ServiceLineProfileVersion: (`createdById`); (`publishedById`)
- SavedSearch: (`lastRunId`) · SearchRun: (`csvFileId`)
- AuditFinding: (`dismissedById`) · ScoreReview: (`decidedById`)
- CrossSellGroup: (`leadingLeadId`); (`splitById`)
- Enrollment: (`sequenceId`)
- Message: (`contactId`); (`humanConfirmedById`); (`approvedById`); (`sentById`); (`inReplyToMessageId`); (`inReplyToReplyId`)
- Mailbox: (`senderUserId`) · TrackingEvent: (`mailboxId`)
- Reply: (`mailboxId`); (`contactId`); (`companyId`); (`loggedById`) · ReplyCorrection: (`actorId`)
- Suppression: (`createdById`); (`removedById`)
- ConsentRecord: (`recordedById`); (`revokedById`)
- DataSubjectRequest: (`createdById`); (`fulfilledById`); (`exportFileId`)
- Meeting: (`companyId`); (`contactId`)
- Proposal: (`pdfFileId`); (`approvedById`); (`sentMessageId`); (`createdById`)
- Deal: (`companyId`); (`proposalId`); (`closedById`)
- Handoff: (`pdfFileId`); (`acknowledgedById`)
- HandoffAssignment: (`suggestedUserId`); (`assignedById`)
- Invite: (`acceptedUserId`) · Setting: (`updatedById`)
- IntegrationCredential: (`createdById`); (`updatedById`) · PromptVersion: (`authorId`)

**Reason:** the §2 convention ("every foreign key has an index") wasn't reflected in these tables. Without the indexes, deleting or restricting a parent row scans the child table.

## CR-02-04 · schema doc · `docs/specs/data-model.md` §5.1 (Better Auth tables), for Phase 3

Add under the auth tables:

> Checked against the installed better-auth 1.7.6 (`@better-auth/core` get-tables, and the twoFactor and admin plugin schemas) on 2026-09-26. Model names are the library defaults, so the Prisma adapter needs no mapping.
> - `account` has no unique on (`providerId`, `accountId`) in the library; ours is compatible (the library never writes a duplicate pair) and stays.
> - `rateLimit` has no timestamps in the library, and `session.updatedAt` has no default there. Our `createdAt` defaults and `@updatedAt` fields are filled by Prisma, which the library ignores.
> - `user.role` is our `Role` enum. Configure the admin plugin with `defaultRole: "MEMBER"` and `adminRoles: ["ADMIN"]`.
> - Phase 3 must re-check these if better-auth is upgraded (for example if `account` gains an `issuer` column).

**Reason:** records what was verified, so Phase 3 doesn't redo it and knows what to re-check on an upgrade.

## CR-02-05 · schema doc · `docs/specs/data-model.md` §2 (money)

Add to the money convention:

> Amounts are `Int` (PostgreSQL int4) minor units: at most 2,147,483,647 per stored amount, which is ₦21,474,836.47, $21,474,836.47 or £21,474,836.47. A larger amount can't be stored. Phase 14 validates proposal and deal amounts against this ceiling before saving (`toMinor` only guarantees a safe integer). If a single naira amount could exceed it, change the money columns to `BigInt` in one migration.

**Reason:** the ceiling is realistic for large Nigerian contracts (₦25m+) and isn't written anywhere. Recommendation: accept it for launch.

## CR-02-06 · seed plan · `docs/specs/data-model.md` §10

1. §10.4, replace "10 more companies each have a second lead…" with:

   > 11 more companies each have a second lead where one of the two is early (NEW to AUDITED) or closed, so no other cross-sell group forms. (64 companies hold 76 leads, so 12 companies have two.)

2. §10.4, after "Each company has 1–3 contacts…", add:

   > The Places-only company (named "Place <last 6>") has no contact yet: Places data can't be stored (INV-14) and it hasn't been enriched.

3. §10.8 **Handoffs (4)**, add:

   > The §10.2 loads add up to 16 active assignments, and an assignment is unique per (handoff, line), so each of the four handoffs assigns all four lines and each won deal lists all four `services`.

4. §10.6 **Findings (~120)** → "Findings (about 130)"; §10.8 **Meetings (about 12)** → "Meetings (15)" (every status, plus a cancelled booking that sent a lead back to REPLIED).

5. §10 intro: add "Phase 2's seeders use orders 10–90 (users 10, platform rows 15, profiles 20, directory 30, leads and search 40, audits 50, outreach 60, inbox 70, compliance 80, pipeline 90). Platform rows come second because search runs and audits point at job runs."

6. §10.7 **Messages**: replace "SENT emails … and SENT_ASSISTED WhatsApp first touches for Nigeria" with "SENT emails for international leads, and SENT_ASSISTED WhatsApp touches for Nigeria: while `acquisition.compliance.ngDirectMarketingBasis` is pending (the seed's default), Nigerian leads get no cold email and carry `complianceReview` (INV-25). The UK sole trader's consent is recorded before its first email (INV-6)."

**Reason:** the plan's own numbers force items 1–5 (64 companies and 76 leads; 16 assignments across 4 handoffs), and item 6 makes the seed obey INV-25 and INV-6, which the plan's wording contradicted. `prisma/seed/world/world.test.ts` checks the seed against every other figure in §10.

## CR-02-07 · spec · `docs/specs/module-acquisition.md` §5.2

The lifecycle diagram draws `IN_REVIEW → NURTURE` and `APPROVED → NURTURE`, but the transition table (which the code implements, `LEAD_TRANSITIONS`) doesn't allow them. Pick one:

- **(Recommended)** remove the two edges from the diagram. A lead held for capacity or compliance is held at SCORED (→ NURTURE), before a draft exists.
- Or add both rows to the table, with the NURTURE side fields, and Phase 2 adds them to `LEAD_TRANSITIONS` and its tests.

**Reason:** the diagram and the table disagree; the table is what's enforced.

## CR-02-08 · contract doc · `docs/contracts/permissions.md` example ids

In the worked example, replace `cm1memberA0000000000000001` with `cm1membera0000000000000001`.

**Reason:** ids are lower-case cuids; `IdSchema` rejects the upper-case "A", so the example doesn't parse.

## CR-02-09 · contract docs · transcription changes (`docs/contracts/*.md`)

Apply these to the docs so they match `src/contracts/` (each was needed for the strict tsconfig or the installed Zod):

1. `common.md`: `IdSchema` is `z.string().regex(/^[cC][0-9a-z]{6,}$/, { error: "Invalid id" })`. Zod 4's `z.cuid()` is deprecated (lint `no-deprecated`).
2. `common.md`: `common.ts` re-exports `APP_ERROR_STATUS`, `AppErrorCode` and `ActionResult` from `src/lib/errors.ts` and `src/lib/result.ts` (CR-01-09), the one runtime import from `src/lib`; the money helpers live in `src/lib/money.ts`.
3. `jobs.md`: `EnqueueJob`, `RunJobInline`, `RunBatch` and `GetBatchResults` take and return `unknown` where the doc had single-use type parameters (lint `no-unnecessary-type-parameters`); callers narrow with the job's schema.
4. `audit-agent.md`: the audit context's `cache.get` returns `Promise<unknown>` (the doc's `unknown | null` collapses to `unknown`; lint `no-redundant-type-constituents`).
5. Seam signatures with a `tx: Tx | null` parameter are typed `tx: unknown /* Tx | null */` in contracts, because contracts can't import `@/platform/db`.
6. `service-line-profile.md`: add `SequenceStepPurposeSchema` (the step purposes as a Zod enum), which `SequenceStep.purpose` stores.

**Reason:** the contracts must compile under the project's lint rules; the behaviour is unchanged.

## CR-02-10 · CI · `.github/workflows/ci.yml` (verify job)

1. After "Generate the Prisma client", add:

   ```yaml
      - name: Registry is up to date
        run: pnpm registry:gen --check
   ```

2. Replace the "Apply migrations to the CI database" step's `run:` (both jobs) with `pnpm db:deploy`.
3. After it, add:

   ```yaml
      - name: Schema and migrations agree
        run: pnpm db:validate
   ```

**Reason:** "CI catches a stale `generated.ts`" (Phase 2 done-when). The check must run before `pnpm typecheck`, whose pre-script regenerates the file. `db:validate` fails when the schema and the migrations disagree (drift), using a throwaway database on the CI server.

## CR-02-11 · config · `vitest.config.ts`

Add a `globalSetup` that applies migrations to the test database before any test runs:

```ts
test: {
  globalSetup: ["./tests/setup/migrate-test-db.ts"],
  // …
}
```

and `tests/setup/migrate-test-db.ts` (Phase 1 owns `tests/setup/**`):

```ts
// Applies pending migrations to the test database (DATABASE_URL_TEST, else DATABASE_URL).
import { spawnSync } from "node:child_process";

export default function setup(): void {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (url === undefined) return;
  const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error("Couldn't migrate the test database.");
}
```

**Reason:** integration tests need a migrated `futureuni_test*`. `pnpm phase start` migrates only the dev database when it can't clone (see `scripts/phase.mjs`), so a worktree's test database can be empty. `.env.local` must be loaded first (as `tests/setup/test-env.ts` does).

## CR-02-12 · config · `tsconfig.json`

Add the path alias `"@/tests/*": ["./tests/*"]`.

**Reason:** tests import the factories with relative paths (`../../../tests/factories`). An alias keeps them stable when files move. Vitest reads tsconfig paths already.

## CR-02-13 · rules · `.claude/project-rules.md` "Stack and commands"

Replace the command rows below, and remove the "Added by later phases" sentence's Phase 2 part:

| Task | Command |
|---|---|
| DB migrate (development) | `pnpm db:migrate --name <change>` (`prisma migrate dev`; read the generated SQL) |
| DB apply migrations | `pnpm db:deploy` (`prisma migrate deploy`; CI, previews, production, `pnpm phase start`) |
| DB validate | `pnpm db:validate` (`prisma validate`, then a drift check in a throwaway local database) |
| DB generate client | `pnpm db:generate` (also runs automatically before `dev`, `build`, `typecheck` and `test`, only when the schema changed) |
| DB seed | `pnpm db:seed` (idempotent; see `prisma/seed/README.md`) |
| DB reset (development only) | `pnpm db:reset` (local databases only: drop, re-apply migrations, generate, seed) |
| Module registry | `pnpm registry:gen` (writes `src/platform/registry/generated.ts`; `--check` fails when it's stale) |
| New module | `pnpm create-module <id> "<Name>"` (id: 2–32 lower-case letters) |

And add under "Database and ORM":

> - Prisma 7 refuses `migrate reset` (and a destructive `migrate dev`) when an AI agent runs it, until the user consents. Agents ask the user to run `pnpm db:reset` themselves (`! pnpm db:reset`), or check a fresh database with `pnpm db:deploy` against a throwaway local database.

**Reason:** the table still said `db:reset` is `prisma migrate reset`, which in Prisma 7 no longer seeds or generates. The consent gate blocked Phase 2's own `pnpm db:reset` run, and later phases will hit it.

## CR-02-14 · spec · `docs/specs/platform.md` §3.14 and `docs/contracts/module-manifest.md` (module ids)

Add: "A module id is 2–32 lower-case letters (for example `marketing`), and isn't `platform` or a reserved route segment (`home`, `settings`, `admin`, `dev`, `login`, `invite`, `reset`, `setup-2fa`, `signed-out`, `u`, `api`)."

**Reason:** the id becomes the first segment of the module's permissions, jobs, AI tasks and events, whose patterns only allow letters there. `pnpm create-module` enforces it.

## CR-02-15 · contract doc · `docs/contracts/module-manifest.md` (navigation rule)

Add to the navigation rules: "An item with a line-scoped permission and no `resource` shows when the action is allowed for at least one service line; the page then filters by the user's lines (platform.md AC-8.1)."

**Reason:** without it, `acquisition.overview.read` (LINES for SERVICE_LEAD and MEMBER) would hide the Overview from everyone below MANAGER. `getNavigation` implements this rule, and `registry.test.ts` covers each role.

## CR-02-16 · notes for Phase 6 · `docs/contracts/jobs.md` and `docs/specs/platform.md` (storage)

1. Jobs: "`defineJob` (`@/platform/registry/define`) wraps a single handler's `run` and the `idempotencyKey` so they parse input with the job's schema first. A workflow handler's `entry` is kept as the exact function (the Workflow build tags the \"use workflow\" function, and `start()` needs that reference), so the platform parses workflow input at enqueue (rule 10) before `start()`."
2. Storage: "The local storage driver keeps a file at `.storage/<key>` (the key's `/` segments become folders). The development seed writes under `seed/…` (screenshots, imports, proposals, handoffs), so the local driver must read existing files at those keys."

**Reason:** both were fixed in Phase 2 and Phase 6 builds on them.

## CR-02-17 · contract docs · type fixes from the Phase 2 review (`docs/contracts/events.md`, `jobs.md`, `module-manifest.md`)

Apply these to the docs; `src/contracts/` already has them, with tests:

1. `events.md`: `NewEvent` is distributive, so a name can only carry its own payload:
   ```ts
   export type NewEvent<N extends DomainEventName = DomainEventName> = N extends DomainEventName ? Omit<EventOf<N>, "id" | "occurredAt"> : never;
   ```
   Before, `publish({ name: "deal.won", payload: <user.invited payload> })` type-checked.
2. `events.md`: add `AnySubscriberDefinition` (the erased form manifests list) and `DefineSubscriber = <N>(def: SubscriberDefinition<N>) => AnySubscriberDefinition`. Phase 2's `defineSubscriber` checks the event name before calling the typed handler. `module-manifest.md`: `subscribers?: AnySubscriberDefinition[]` and `getAllSubscribers(): AnySubscriberDefinition[]`. Without it, a typed subscriber couldn't be registered without a cast.
3. `jobs.md`: the workflow variant's `entry` uses method syntax, `entry(input: TInput, ctx: JobContext): Promise<JobResult>;`, so a typed entry widens to `AnyJobDefinition` without a cast and without being wrapped (see CR-02-16).

**Reason:** each was a real type hole a later phase would have hit (found by the Phase 2 review).

## CR-02-18 · contract doc · `docs/contracts/source-adapter.md` (Google Places location, INV-14)

In the worked example and rule 4, a Google Places candidate's city and region must come from the search that found it, not the listing's address: add "`searchLocation: { city, region }` (from the SearchSpec location); the listing's own address, city and region are passed for matching only and never stored". `upsertCompany` (`@/platform/directory`) keeps only `searchLocation` for a transient source.

**Reason:** module spec §3.5.1 allows only the `place_id` and derived facts (the `no_website` signal, a mapped category, the search that found it). The example stored the city from the Places address.

## CR-02-19 · rules · `.claude/project-rules.md` (a rule for partial unique indexes)

Add under the data rules: "Never `upsert`, `findUnique`, `update` or `delete` through a partial unique index's key (listed in `src/platform/db/README.md`): Prisma types them as unique keys, but upsert fails (SQLSTATE 42P10) and the others can pick a row outside the index. Use `findFirst` with the predicate and write by `id`, or `createOrOnConflict` from `@/platform/db`."

**Reason:** a trap every later phase can walk into (settings, notification dedupe, suppressions, webhook dedupe).

## CR-02-20 · ownership · `CLAUDE.md` grants (package.json scripts)

Record these Phase 2 scripts, which go beyond "adding the phase's own named scripts":
- `postinstall` and `prelint`, `predev`, `prebuild`, `pretypecheck`, `pretest`: generate the Prisma client when the schema changed (`node prisma/tools/generate.mjs`), and the registry (`pnpm registry:gen`) before the steps that need them. Without them a fresh clone or worktree fails lint and typecheck, because `src/generated/` is gitignored.
- `db:deploy` (`prisma migrate deploy`, named in project-rules).
- `db:reset` rewritten from `prisma migrate reset` to `node prisma/tools/reset.mjs` (local only; re-applies migrations, generates, seeds; Prisma 7's reset no longer seeds or generates).

Proposed wording for the grant row: "`package.json` scripts: … for 2, also `db:deploy`, `db:reset`, `postinstall` and the `pre*` generation hooks".

**Reason:** Phase 1 owns `package.json`; these changes were needed for the project to build from a fresh clone.

## CR-02-21 · notes for later phases (from the Phase 2 review; not changed in Phase 2)

- **Phase 6 and 19:** the registry getters (`getCronSchedules`, `getHomeWidgets`, `getCommands`, …) default to every module, disabled ones included. Callers pass `{ modules: await getEnabledModules() }` so a disabled module's schedules, widgets and commands stop (module-manifest rule 4).
- **Phase 4:** gate module routes centrally in the platform layout (a disabled module returns NOT_FOUND). The create-module page template doesn't check it. Use `mayOpen(user, action, resource)` (`@/platform/registry`) for widgets and commands so OWN-scoped items show to their owners.
- **Phase 5:** `CITATION_MARKER` (`ai-service.md`) is a global regex; use it only with `matchAll`/`replace`, or build a fresh `RegExp` for `test`/`exec`.
- **Phases 2 and 19:** `ModuleManifest` is the parsed type, so manifest authors must spell out fields that have defaults (`resourceFields`, widget `size`/`order`). The `permission()` helper fills `resourceFields`; a follow-up could accept the Zod input type in `defineModule`.
- **Phase 9:** CHECK constraints that require a value (finding and signal `sourceUrl`, `removedReason`, `overrideNote`) accept an empty string; validate non-blank values in code (Zod), or add `NULLIF(btrim(col), '') IS NOT NULL` checks in a later migration.

## CR-02-22 · ownership · `scripts/ownership/ownership.json` (the lockfile)

Let every phase change `pnpm-lock.yaml`, as it may `package.json` dependencies: add it to the always-allowed paths in `scripts/ownership/check.mjs` and the guard (next to `phases/<nn>/**`), or to each phase's `alsoAllow`.

**Reason:** CLAUDE.md lets every phase `pnpm add` a dependency ("Lockfile conflicts are resolved at merge by reinstalling"), but `node scripts/ownership/check.mjs --phase-diff` fails any phase branch whose lockfile changed. Phase 2's branch fails it only for `pnpm-lock.yaml` (croner, libphonenumber-js, tldts).
