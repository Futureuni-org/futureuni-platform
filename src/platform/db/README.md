# src/platform/db/

**Owner: Phase 02 (Core schema and registry).** The only way into the database (ADR-019). Other
code reaches it through `@/platform/db` or through `*.repo.ts` files built on it; nothing imports
the generated client directly (lint-enforced).

| Export | What |
|---|---|
| `db` | The Prisma client over `@prisma/adapter-pg` and a `pg` Pool (`attachDatabasePool` on Vercel). Reads of Company, Contact and FileObject skip soft-deleted rows unless the `where` mentions `deletedAt` |
| `dbIncludingDeleted` | The same connection without soft-delete scoping: data-subject requests, the retention purge and restores only |
| `disconnectDb()` | Closes the client and pool (scripts, test teardown) |
| `Tx`, `Db`, `withTransaction(fn, { timeoutMs, maxWaitMs, isolationLevel })`, `dbOr(tx)` | Transactions (10 s timeout by default). Helpers that must run inside one take a `Tx` first |
| `withSavepoint(tx, fn)` | Runs a write that may hit a unique index inside a savepoint, so the transaction survives the error. Each call has its own savepoint, so nesting is safe |
| `createOrOnConflict(tx, constraint, create, onConflict)` | Create, or handle the conflict on that unique index. The way to "upsert" on a partial unique index (below) |
| `paginate`, `encodeCursor`, `decodeCursor`, `afterClause`, `NEWEST_FIRST`, `MAX_PAGE_SIZE` (100) | Keyset pagination on `(createdAt, id)` newest first. Combine with filters as `where: { AND: [filters, afterClause(after)] }`, never by spreading |
| `toDbAppError`, `rethrowDbError`, `isUniqueViolation`, `violatedConstraint`, `sqlState` | Database errors as `AppError`: unique or foreign key → CONFLICT, CHECK or NOT NULL → VALIDATION_FAILED, missing record → NOT_FOUND. The response carries no internals; the constraint name is only on the sanitised `cause` (logs) and `violatedConstraint(error)` |
| `toJsonInput(value)` | A contract value as Prisma JSON input |
| `defineSeeder`, `Seeder`, `SeedContext` | Development seeders (see `prisma/seed/README.md`) |
| `Prisma` and every model type | Re-exported from the generated client |

In development, queries slower than 200 ms are logged with their SQL and duration only (never
parameters).

## Partial unique indexes: don't upsert or findUnique on them

Several unique indexes are partial (they apply only to some rows), and Prisma still lists their
columns as unique keys in its types. Using those keys compiles, but:

- `upsert` fails: PostgreSQL can't match `ON CONFLICT` to a partial index (SQLSTATE 42P10);
- `findUnique`, `update` and `delete` may pick a row the index doesn't cover (a stopped enrolment,
  a removed suppression, a used invite).

Find with `findFirst` and the index's predicate, then write by `id`; or create and handle the
conflict with `createOrOnConflict(tx, "<index name>", create, onConflict)`. The partial ones:

| Model | Key | Index | Applies to |
|---|---|---|---|
| Invite | `email` | `invites_email_pending_key` | not used and not revoked |
| Company | `normalizedDomain` | `companies_normalizedDomain_live_key` | not deleted |
| Contact | `companyId_email` | `contacts_companyId_email_live_key` | email set, not deleted |
| Notification | `userId_dedupeKey` | `notifications_userId_dedupeKey_key` | `dedupeKey` set |
| Setting | `key_scope`, `key_scope_userId` | `settings_key_scope_global_key`, `settings_key_scope_user_key` | no user / a user |
| PromptVersion | `task` | `prompt_versions_task_active_key` | active |
| ServiceLineProfileVersion | `serviceLine` | `acq_profile_versions_one_active_key`, `…_one_draft_key` | active / draft |
| Signal | `companyId_serviceLine_signalType_adapterId_externalRef` | `acq_signals_external_dedupe_key` | `externalRef` set |
| Lead | `companyId_serviceLine_market` | `acq_leads_one_open` | open statuses |
| CrossSellGroup | `companyId` | `acq_cross_sell_groups_one_active_key` | ACTIVE |
| Enrollment | `companyId` | `acq_enrollments_one_open_thread` | ACTIVE or PAUSED (INV-9) |
| MessageCitation | `messageId_findingId`, `messageId_signalId` | `acq_message_citations_finding_key`, `…_signal_key` | the id set |
| TrackingEvent | `provider_providerEventId` | `acq_tracking_events_provider_event_key` | event id set |
| Reply | `mailboxId_providerMessageId` | `acq_replies_mailbox_message_key` | both set |
| Suppression | `type_value` | `acq_suppressions_live_key` | not removed |
| Meeting | `source_externalId` | `acq_meetings_source_external_key` | `externalId` set |

To-many relation includes aren't soft-delete scoped either: add `where: { deletedAt: null }` when
including a company's contacts or files.
