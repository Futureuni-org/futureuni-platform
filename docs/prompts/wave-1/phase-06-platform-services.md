# Phase 6: Jobs, Scheduler, Notifications, Audit Log, Settings and Credentials

> **How to run this phase**
> 1. Wave 0 must be merged, and Part A of `wave-1-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 06 platform-services`, then open Claude Code in the new worktree folder. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-06-platform-services.md and execute it. Plan first."**
>
> Wave 1. Runs in parallel with Phases 3, 4 and 5. Depends on Phases 0–2.

---

## Your role and the goal of this phase

You are building the **platform services every module relies on**, following the `saas-api` and `saas-notify` skills:

1. **Background jobs** on Vercel Workflow: durable multi-step work that resumes from the last completed step.
2. **Scheduling:** module manifests declare cron schedules, and one dispatcher runs them. Modules never edit `vercel.json`.
3. **The job-run log:** every run is recorded and idempotent.
4. **Domain events:** a small event bus that modules publish to and subscribe to.
5. **Notifications:** in-app and email, one entry point, with user preferences.
6. **The audit log helper:** one way to record who did what.
7. **The settings store:** typed, validated settings that modules register.
8. **The credentials vault:** encrypted storage for integration API keys, with connection testing.
9. **File storage:** Vercel Blob, behind an adapter with a local mock.

**No screens in this phase.** Phase 18 builds the admin UI (settings, integrations, job monitor, audit viewer) and Phase 4 builds the notification bell. You build and test the services and server actions they call.

---

## Step 0: Read first

1. `CLAUDE.md` and `.claude/project-rules.md`, especially the invariants on audit, timestamps and credentials, and the bans (no plain-text credentials)
2. `docs/contracts/jobs.md`, `events.md`, `module-manifest.md` and `permissions.md`, plus their `src/contracts/` files
3. `docs/specs/platform.md`: notifications, audit log, settings, credentials, files
4. `docs/integrations.md`: the providers that will need credentials
5. The Prisma models `JobRun`, `Notification`, `AuditLog`, `Setting`, `IntegrationCredential` and `FileObject`
6. `src/platform/registry/`: `getAllJobs()`, `getCronSchedules()` and `getSettingsPanels()`
7. `phases/00..02/SUMMARY.md` and the seams in `docs/prompts/wave-1-prep-and-merge.md`
8. The global skills `saas-api` (webhooks, outbound calls, idempotency), `saas-notify` (in full), `saas-data` (transactions), `saas-testing` and `saas-review`

Use Context7 to check the **current** docs for:

- Vercel Workflow: defining workflows and steps, starting runs, retries, sleeps, hooks and webhooks, local development, observability, and where workflow files must live
- Vercel Cron: `vercel.json` format, the securing header or secret, and plan limits
- Vercel Blob
- Resend and React Email

---

## What you own

- `src/platform/jobs/**`
- `src/platform/events/**` (raise a request to add it to the ownership map, if Part A missed it)
- `src/platform/notifications/**`
- `src/platform/audit-log/**`
- `src/platform/settings/**`
- `src/platform/credentials/**`
- `src/platform/storage/**`
- `src/app/api/cron/**`, `src/app/api/workflows/**` and `src/app/api/notifications/**`
- `src/workflows/_platform/**` (or the location the Workflow docs require)
- `src/emails/**`
- `phases/06/**`

You **don't** own `vercel.json`. Put the single cron entry you need in `phases/06/REQUESTS.md` (see Step 2).

---

## Step 1: Jobs on Vercel Workflow (`src/platform/jobs/`)

Implement the jobs contract:

1. **Defining jobs.** A module declares jobs in its manifest (Phase 2's registry collects them). A job definition contains:
   - `name` (`module.job-name`)
   - `description`
   - `input` Zod schema
   - `handler`: either a Vercel Workflow with steps, or a simple single-step function
   - `concurrency` (maximum parallel runs; the default is 1 for schedules)
   - `timeout`
   - `retry` policy
   - `idempotencyKey(input)`
2. **Starting jobs:** `enqueueJob(name, input, { actor, idempotencyKey?, runAt? })`.
   - Validates the input.
   - Creates the `JobRun` (status `QUEUED`, unique idempotency key; a duplicate key returns the existing run without starting another).
   - Starts the Workflow run.
   - Returns `{ jobRunId, deduplicated }`.
3. **Inside a run:**
   - The framework updates `JobRun` to `RUNNING`, records attempts, and ends with `SUCCEEDED`, `FAILED` or `CANCELLED`, plus `finishedAt`, a short error summary and a `counts` JSON (for example `{ found: 42, created: 17 }`).
   - Steps report progress through a `ctx.progress({ ... })` helper.
   - Steps use the Workflow step API so a failure in step 3 retries from step 3, not step 1.
4. **Control:**
   - `cancelJob(jobRunId)`
   - `retryJob(jobRunId)` (a new run linked to the old one)
   - `listJobRuns({ name?, status?, from?, to?, cursor })`
   - `getJobRun(id)`
   - Each checks permission through `SEAM-PERMISSION`.
5. **Local development:**
   - Runs with the Workflow local dev tooling.
   - Provide `pnpm jobs:run <name> '<json>'` to trigger a job by hand, and document it.
   - In tests, an **inline runner** executes jobs synchronously without Workflow infrastructure, behind the same interface.
6. **Built-in platform jobs,** registered in a platform jobs list that the Wave 1 integration adds to `core-manifest.ts`:
   - `platform.notifications-digest`: an optional daily email digest of unread notifications
   - `platform.job-runs-cleanup`: prunes old successful `JobRun` rows after a retention period
   - `platform.retention-purge`: purges personal data per the retention ADR (the framework only; Phase 19 adds acquisition-specific purges)
   - `platform.credentials-health`: tests each configured integration daily and notifies admins about failures

---

## Step 2: Scheduling with one cron dispatcher

Modules never touch `vercel.json`. Instead:

1. **One Vercel Cron entry** calls `GET /api/cron/tick` every 5 minutes. Add this exact entry to `phases/06/REQUESTS.md` for `vercel.json`.
2. **`/api/cron/tick`:**
   - verifies the Vercel cron secret or header (per current docs), rejecting anything else
   - reads `getCronSchedules()` from the registry
   - works out which schedules are due in the current 5-minute slot, using a cron parser and the schedule's timezone (default `Africa/Lagos`, configurable per schedule)
   - enqueues each due job with the idempotency key `"<job>:<slot-iso>"`, so a retried or duplicated tick never double-runs a job
3. **Schedules can be switched off** per job through the settings store (`jobs.<name>.enabled`). Saved searches (Phase 15) will create **dynamic schedules** stored in the database. Support this now:
   - a `getDynamicSchedules()` extension point that modules implement through their manifest (for example `dynamicSchedules: () => Promise<Schedule[]>`)
   - the dispatcher merges them with the static schedules
   - if the manifest contract lacks this field, raise a contract change request and implement it behind a feature flag
4. **Tests:** the due-slot calculation (including timezones and daylight-saving-time edges for international schedules), idempotency, and rejection of unauthenticated calls.

---

## Step 3: Domain events (`src/platform/events/`)

- `publish(event)`, typed by the events contract.
- **After-commit delivery.** When publishing inside a transaction, use `publishAfterCommit(tx, event)`, so a rolled-back transaction never emits.
- **Subscribers** are declared in module manifests, or registered through a `subscribers.ts` discovered by code generation; follow the contract. Each has a `handler` and a mode:
  - `inline`: fast, same request, errors are logged but never break the publisher
  - `job`: enqueued as a background job, for anything slow
- **Platform subscribers you provide:**
  - `notification-router`: maps events to notifications using the rules in Step 4
  - `audit-bridge`: for events that must be audited but weren't audited directly
- Tests: after-commit behaviour, subscriber isolation (one failing subscriber doesn't affect the others), job-mode enqueueing.

---

## Step 4: Notifications (`src/platform/notifications/`, `src/emails/`)

Follow `saas-notify`:

1. **One entry point:** `notify({ userIds | role | serviceLine, type, title, body?, link?, data?, channels?, dedupeKey? })`.
   - It fans out to in-app and email based on **user preferences** and the notification type's defaults.
   - The dedupe key prevents repeats within a window.
2. **Notification types registry.** Each type has an ID, a label, default channels and whether it's `critical`; critical types can't be muted. Seed these types:
   - `review.queue-waiting`
   - `reply.interested`
   - `reply.needs-action`
   - `meeting.booked`
   - `meeting.reminder`
   - `deal.won`
   - `deal.lost`
   - `capacity.line-full`
   - `job.failed`
   - `integration.failing`
   - `ai.budget-warning`
   - `ai.budget-exceeded`
   - `security.role-changed`
   - `security.2fa-reset`

   Modules add their own types through their manifest or a registry call.
3. **In-app services:**
   - `listForUser(userId, { unreadOnly?, cursor, limit })`
   - `unreadCount(userId)`
   - `markRead(userId, ids | "all")`
   - `getPreferences(userId)` and `updatePreferences(userId, prefs)`
   - server actions wrapping them
   - `GET /api/notifications/stream`, a lightweight polling endpoint (or server-sent events if simple and reliable on Vercel), so the bell updates without a reload
4. **Email:**
   - An `EmailSender` adapter for **platform or transactional** mail with `mock` and `resend` implementations. The mock writes emails to the console and to an in-memory outbox that tests can read.
   - This is separate from the cold-outreach sender, which Phase 12 builds on the outreach-channel contract. Don't mix them.
   - React Email templates in `src/emails/`, branded with the FUTUREUNI palette and logo:
     - invite
     - verify email
     - password reset
     - role changed
     - 2FA enabled/reset
     - notification (a generic single notification)
     - daily digest
     - budget warning
   - Every email has a plain-text version.
   - A development-only preview route renders every template.
   - `sendEmail({ to, template, props })` is the function Phase 3's `SEAM-AUTH-EMAIL` wires into at merge.
   - Deliverability notes (SPF, DKIM, DMARC for the platform sending domain) go in your summary for Phase 21.
5. **Sending is asynchronous** through a job, with retries and a per-recipient rate limit.

---

## Step 5: Audit log (`src/platform/audit-log/`)

- **`audit.record(tx | null, entry)`**, with the **exact signature of `SEAM-AUDIT`** used by Phases 3 and 5:
  - actor
  - `action` (named `module.resource.verb`)
  - `targetType` and `targetId`
  - `before` and `after`
  - `ip` and `userAgent`
- **Diff storage.** It stores `before` and `after` as JSON, redacting sensitive keys automatically: anything matching `password`, `token`, `secret`, `apiKey`, `ciphertext` and similar.
- **`withAudit(tx, entry, fn)`** is a helper that runs a mutation and records the audit entry in the same transaction.
- **Queries** for Phase 18's viewer: `listAudit({ actorId?, action?, targetType?, targetId?, from?, to?, cursor })` and `getAuditForTarget(type, id)`.
- **The audit log is append-only.** There's no update or delete service. The retention purge only removes entries past the legal retention period, if one is set in settings.

---

## Step 6: Settings store (`src/platform/settings/`)

- **Typed settings registry.** Each setting key has:
  - a Zod schema
  - a default
  - a scope: `platform`, `module`, or `user`
  - a label and description
  - `sensitive: false` (secrets never go here; they go in credentials)
  - `requiredPermission` to edit
- Modules register keys through the manifest's settings panels or a `settings.ts`, following the contract.
- **Services:**
  - `getSetting(key, { userId? })`: typed, falls back to the default, cached per request with invalidation on write
  - `setSetting(actor, key, value)`: validates, checks permission through `SEAM-PERMISSION`, audits, and emits `settings.changed`
  - `listSettings({ scope, module? })`
- **Register the platform keys:**
  - `module.<id>.enabled`
  - `jobs.<name>.enabled`
  - notification defaults
  - the platform timezone (default `Africa/Lagos`)
  - the platform postal address (needed for outreach emails, invariant 4)
  - the retention periods
  - the AI settings keys requested by Phase 5 (check `phases/05` isn't available to you; register the shapes from the Wave 1 seam table, `SEAM-SETTINGS-AI`)

---

## Step 7: Credentials vault (`src/platform/credentials/`)

1. **Encryption:**
   - AES-256-GCM with `CREDENTIALS_ENCRYPTION_KEY` from `src/env.ts`
   - a random IV per record
   - the auth tag stored alongside
   - a `keyVersion` for rotation
   - Plaintext never touches the database, logs, audit entries or client code.
2. **Services** (server-only):
   - `saveCredential(actor, provider, payload)`: the payload is validated by the provider's Zod schema; `ADMIN` only
   - `getCredential(provider)`: returns the decrypted payload, server-only, for adapters to use; **this is the function Phase 5's `SEAM-AI-CREDENTIALS` wires into**
   - `getCredentialStatus(provider)`: masked (for example `sk-…a91f`), plus `status`, `lastTestedAt` and `lastError`
   - `testCredential(actor, provider)`
   - `deleteCredential(actor, provider)`
   - `rotateEncryptionKey()`: re-encrypts every record with a new key version, via a CLI script `pnpm credentials:rotate`
3. **Provider registry.** Each provider has:
   - an ID
   - a label
   - a payload schema (API key; or key plus secret; or OAuth tokens)
   - a `test()` function that makes one cheap, read-only call
   - docs and signup links from `docs/integrations.md`

   Register every provider in `docs/integrations.md`: Anthropic, Google Places, PageSpeed, YouTube Data, SerpAPI, Adzuna, Hunter/Apollo, Companies House, Resend, the outreach sender, the calendar, and the screenshot runtime. In mock mode, `test()` returns success.
4. **Resolving credentials:** adapters look for a stored credential first, then the env variable, then (in mock mode) nothing. Expose this as `resolveProviderKey(provider)`.
5. Every save, test and delete is audited, with the payload **never** included.

---

## Step 8: File storage (`src/platform/storage/`)

- A `StorageAdapter` with two implementations:
  - `vercel-blob`
  - `local`, which writes to `.storage/` and is gitignored, for development and tests
- **Functions:**
  - `putFile({ key, body, contentType, access: "private" | "public" })`
  - `getSignedUrl(key, ttl)`
  - `deleteFile(key)`
  - `createUploadUrl(...)`, for direct browser uploads, following the saas-api upload rules
- **Every file gets a `FileObject` row** recording who uploaded it, its size, type and purpose (`audit-screenshot`, `proposal-pdf`, `csv-import`, `portfolio`).
- Type and size are validated on the server. Never trust the file extension.

---

## Step 9: Seams (stand-ins in your own folders)

```ts
// src/platform/_seams/permission.ts
// SEAM:SEAM-PERMISSION
export function assertCan(actor: Actor, action: PermissionAction, resource?: PermissionResource): void;
// stand-in: reads the actor's role from the User table; ADMIN allowed for settings/credentials/jobs admin actions, MANAGER allowed for job retry/cancel and notification-type preferences, others denied
```

At merge, it's replaced with `assertCan` from `@/platform/auth`. Write the wiring in `phases/06/REQUESTS.md`.

In the same file, list what **you provide** for other phases' seams:

- `audit.record` for `SEAM-AUDIT`
- `sendEmail` for `SEAM-AUTH-EMAIL`
- `getCredential` for `SEAM-AI-CREDENTIALS`
- `getSetting` for `SEAM-SETTINGS-AI`
- `listForUser` / `unreadCount` / `markRead` for `SEAM-NOTIFICATIONS-SHELL`

Confirm each signature matches the seam table in `wave-1-prep-and-merge.md` exactly.

---

## Step 10: Tests

- **Unit tests:**
  - cron due-slot calculation, including timezones and daylight saving
  - idempotency keys
  - redaction of sensitive keys in the audit log
  - AES-GCM round trip, tamper detection (a modified ciphertext fails) and key rotation
  - settings validation and defaults
  - notification preference resolution, including critical types that can't be muted
  - notification dedupe
- **Integration tests** (inline job runner plus the test database):
  - `enqueueJob` creates exactly one `JobRun` for duplicate keys
  - a failing step retries without re-running earlier steps
  - `publishAfterCommit` doesn't emit on rollback
  - `notify` creates in-app rows and queues email according to preferences
  - `saveCredential` stores only ciphertext, while `getCredential` returns the plaintext on the server
  - `/api/cron/tick` rejects missing secrets and enqueues due jobs once
- **A Workflow proof in local development:** run `platform.credentials-health` through the real local Workflow runtime and confirm the `JobRun` lifecycle is recorded. Record the result.
- **A local email preview check:** render every template to HTML, and snapshot only the plain-text versions, to avoid snapshot noise.

---

## Constraints

- **Don't import Phase 3, 4 or 5 code.** Use the seam.
- **Don't edit `vercel.json`, the schema or the contracts.** Raise requests.
- **No admin screens.** Services and server actions only.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] Jobs on Vercel Workflow work: enqueue with idempotency, step-level retry, cancel/retry, the job-run log, the inline test runner, and the `pnpm jobs:run` script.
- [ ] One cron dispatcher runs manifest schedules and dynamic schedules idempotently. The single `vercel.json` entry is in `REQUESTS.md`.
- [ ] The event bus has after-commit delivery and inline/job subscribers.
- [ ] Notifications work: `notify()` entry point, types registry, preferences, in-app services, polling endpoint, the Resend/mock email adapter, and branded React Email templates with a preview route.
- [ ] The audit log helper has the exact `SEAM-AUDIT` signature, redaction, `withAudit`, and query services.
- [ ] The typed settings store works, with the platform keys registered.
- [ ] The credentials vault works: AES-256-GCM, masked status, provider registry with `test()`, key rotation, and credentials resolved from the store before env.
- [ ] Storage works through the Blob and local adapters, with a `FileObject` row for every file.
- [ ] Platform jobs are defined and listed for registration.
- [ ] The seams provided and consumed are documented in `phases/06/REQUESTS.md`, with signatures matching the Wave 1 seam table.
- [ ] Each service folder has a `README.md` with one usage example. Every module phase will follow them.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/06/SUMMARY.md` is written.
