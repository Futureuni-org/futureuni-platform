# Phase 06: Jobs, Scheduler, Notifications, Audit Log, Settings, Credentials, Storage: Summary

| | |
|---|---|
| Phase | 06, Jobs, Scheduler, Notifications, Audit Log, Settings, Credentials, Storage |
| Branch | `phase/06-platform-services` |
| Batch / wave | B1 / Wave 1 (parallel with 03, 04, 05) |
| Date finished | 2026-09-29 |
| Prompt | `docs/prompts/wave-1/phase-06-platform-services.md` |
| Verification | `pnpm check`: Pass (`lint` clean · `typecheck` clean · `test` 496 passing · `build` clean, 7 routes) · `pnpm test:e2e`: Not run (no UI routes; Phase 4's smoke test still covers the shell placeholder) · `saas-review`: no open Critical/Major (see §Change requests raised) |

## What was built

The nine platform services every module now relies on:

1. **Credentials vault** (`@/platform/credentials`) — AES-256-GCM ciphertext (INV-21), a provider registry for every integration in `docs/integrations.md`, `saveCredential`/`getCredential`/`testCredential`/`deleteCredential`, `resolveProviderKey` (vault → env → nothing in mocks), and `pnpm credentials:rotate` for key rotation. Meets **US-16** (AC-16.1–AC-16.5).
2. **Audit log** (`@/platform/audit-log`) — `audit.record(tx | null, entry)` with the exact `SEAM-AUDIT` shape, `withAudit(tx, entry, fn)`, recursive redaction of sensitive keys, cursor-paginated queries and a CSV exporter. Append-only (**INV-20**). Meets **US-14**.
3. **Settings store** (`@/platform/settings`) — typed registry with `getSetting`/`setSetting`/`listSettings`, per-request cache via `withSettingsRequest`, and every platform key (`platform.*`, `auth.*`, `ai.*`, `notifications.*`, `user.*`) registered with a Zod schema and default. Emits `settings.changed`. Meets **US-15**.
4. **Domain events** (`@/platform/events`) — `publish` and `publishAfterCommit(tx, event)` (outbox row inside the tx; delivery only after commit), inline and job subscribers, and the platform `notification-router` and `audit-bridge` subscribers. Meets **US-22**.
5. **Jobs on Vercel Workflow** (`@/platform/jobs`) — `enqueueJob` with idempotency-keyed `JobRun` rows (**INV-22**), `cancelJob`/`retryJob`/`listJobRuns`/`getJobRun`, an inline runner for tests and `pnpm jobs:run`, and a `platform.run-job` workflow entry that runs every job through one durable step. Meets **US-19** and **P6-AC2**.
6. **Cron dispatcher** — `GET /api/cron/tick` (bearer-verified) reads every static and dynamic schedule from the registry, uses `croner` for timezone-aware slot math (including DST), and enqueues each due job with the key `<job>[:scheduleId]:<slotIso>`, so a duplicated tick never double-runs a job.
7. **Notifications** (`@/platform/notifications`) — `notify(...)` with recipient resolution (`userIds`, `role`, `serviceLine`), per-user `NotificationPreference` (critical types cannot be muted), `listForUser`/`unreadCount`/`markRead`/`getPreferences`/`updatePreferences`, and a polling endpoint at `GET /api/notifications/stream`. Meets **US-11**.
8. **Platform email** — `EmailSender` adapter with `mock` (in-memory outbox) and `resend` implementations, `sendEmail({ to, template, props, dedupeKey? })` that enqueues `platform.send-email`, and typed React-email-shaped templates in `src/emails/` (`invite`, `verify-email`, `password-reset`, `role-changed`, `two-factor-enabled`, `two-factor-reset`, `notification`, `daily-digest`, `budget-warning`). Dev preview at `GET /api/dev/emails/[template]`. Meets **P6-AC3**.
9. **File storage** (`@/platform/storage`) — `StorageAdapter` interface with `local` (`.storage/<key>`, HMAC-signed URLs) and `vercel-blob` implementations, magic-byte content-type verification, and a `FileObject` row for every upload. Meets **US-20** (AC-20.1, AC-20.3; AC-20.2 wiring lives in the local adapter and is verified end-to-end in Phase 20).

**Constraints proven:**
- AES-GCM round-trip and tamper detection (unit test).
- `enqueueJob` twice with the same key → one `JobRun` (INV-22).
- `publishAfterCommit` inside a rolled-back transaction → no dispatch.
- A file whose bytes don't match the declared content-type is rejected with `UNSUPPORTED_MEDIA_TYPE`.
- Cron slot math is correct across `Africa/Lagos`, `Europe/London` (BST and GMT) and UTC.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/platform/credentials/{crypto,providers,service,rotate,rotate.script,index}.ts` + tests + README | Vault, provider registry, service, rotation CLI |
| `src/platform/audit-log/{redact,service,index}.ts` + tests + README | Audit helper (SEAM-AUDIT) |
| `src/platform/settings/{definitions,service,index}.ts` + tests + README | Typed settings store (SEAM-SETTINGS-AI) |
| `src/platform/events/{publish,dispatch,platform-subscribers,index}.ts` + tests + README | Event bus with outbox |
| `src/platform/jobs/{runtime,registry,enqueue,inline,control,dispatcher,workflow-adapter,platform-jobs,run.script,index}.ts` + tests + README | Job engine, dispatcher, platform jobs |
| `src/platform/jobs/platform-jobs/{retention-purge,credentials-health,notifications-digest}.ts` | Platform-owned job bodies |
| `src/platform/notifications/{types,registry,notify,service,router,index}.ts` + `email/{adapter,send,send-job}.ts` + tests + README | Notification services and email sender (SEAM-AUTH-EMAIL, SEAM-NOTIFICATIONS-SHELL) |
| `src/platform/storage/{adapter,local,blob,service,index}.ts` + tests + README | Storage adapters (`StorageAdapter`) |
| `src/platform/_seams/{permission,index}.ts` + README | SEAM-PERMISSION stand-in |
| `src/emails/{layout,index}.ts` + snapshot test + README | React-email-shaped templates and layout |
| `src/workflows/_platform/{run-job.workflow,run-job.step}.ts` + README | Vercel Workflow entry that runs every job |
| `src/app/api/cron/tick/route.ts` + `src/app/api/cron/README.md` | One cron entry |
| `src/app/api/notifications/stream/route.ts` + `src/app/api/notifications/README.md` | Polling endpoint |
| `src/app/api/dev/emails/[template]/route.ts` + `src/app/api/dev/emails/README.md` | Dev email preview |
| `package.json` (grant) | Added `credentials:rotate` and `jobs:run` scripts |

## Public interfaces other phases can use

```ts
// @/platform/credentials (server-only)
export async function saveCredential(actor: Actor, provider: ProviderId, payload: unknown): Promise<CredentialStatus>;
export async function getCredential<T = CredentialPayload>(provider: ProviderId): Promise<T | null>; // SEAM-AI-CREDENTIALS
export async function getCredentialStatus(provider: ProviderId): Promise<CredentialStatus>;
export async function listCredentialStatuses(actor: Actor): Promise<CredentialStatus[]>;
export async function testCredential(actor: Actor, provider: ProviderId): Promise<CredentialStatus>;
export async function deleteCredential(actor: Actor, provider: ProviderId): Promise<void>;
export async function resolveProviderKey(provider: ProviderId): Promise<string | null>;
export async function rotateEncryptionKey(oldKey: string, newKey: string, newVersion: number): Promise<RotateResult>;

// @/platform/audit-log (server-only)
export const audit: { record(tx: Tx | null, entry: AuditEntry): Promise<{ id: string }> }; // SEAM-AUDIT
export async function withAudit<T>(tx: Tx, entry: AuditEntry, fn: (tx: Tx) => Promise<T>): Promise<T>;
export async function listAudit(query: AuditQuery): Promise<{ items: AuditListItem[]; nextCursor: string | null }>;
export async function getAuditForTarget(targetType: string, targetId: string): Promise<AuditListItem[]>;
export function exportAuditCsv(items: readonly AuditListItem[]): string;

// @/platform/settings (server-only)
export async function getSetting<T = unknown>(key: string, opts?: { userId?: string }): Promise<T>; // SEAM-SETTINGS-AI
export async function setSetting(actor: Actor, key: string, value: unknown, opts?: { userId?: string }): Promise<void>;
export async function listSettings(opts?: { scope?: SettingScope; module?: string; userId?: string }): Promise<SettingListItem[]>;
export async function withSettingsRequest<T>(fn: () => Promise<T>): Promise<T>;

// @/platform/events (server-only)
export async function publish<N extends DomainEventName>(event: NewEvent<N>): Promise<{ eventId: string }>;
export async function publishAfterCommit<N extends DomainEventName>(tx: Tx, event: NewEvent<N>): Promise<{ eventId: string }>;
export async function drainOutboxNow(): Promise<void>; // test-only

// @/platform/jobs (server-only)
export const enqueueJob: (name: JobName, input: unknown, opts: { actor: Actor; idempotencyKey?: string; runAt?: string; parentRunId?: string }) => Promise<{ jobRunId: string; deduplicated: boolean }>;
export async function cancelJob(actor: Actor, jobRunId: string): Promise<void>;
export async function retryJob(actor: Actor, jobRunId: string): Promise<{ jobRunId: string }>;
export async function listJobRuns(actor: Actor, q: ListJobRunsQuery): Promise<{ items: JobRunSummary[]; nextCursor: string | null }>;
export async function getJobRun(actor: Actor, id: string): Promise<JobRunSummary | null>;
export async function runJobInline(name: string, input: unknown, opts?: { actor?: Actor; clock?: Clock; idempotencyKey?: string }): Promise<{ jobRunId: string; result: JobResult; status: "SUCCEEDED" | "FAILED" }>;
export const platformJobs: readonly AnyJobDefinition[];
export const platformSchedules: readonly CronSchedule[];

// @/platform/notifications (server-only)
export async function notify(input: NotifyInput): Promise<NotifyResult>;
export async function listForUser(userId: string, opts?: ListOptions): Promise<{ items: NotificationItem[]; nextCursor: string | null }>; // SEAM-NOTIFICATIONS-SHELL
export async function unreadCount(userId: string): Promise<number>;
export async function markRead(userId: string, target: readonly string[] | "all"): Promise<{ updated: number }>;
export async function getPreferences(userId: string): Promise<UserPreferences>;
export async function updatePreferences(userId: string, updates: readonly PreferenceUpdate[]): Promise<void>;
export async function sendEmail<Id extends EmailTemplateId>(input: SendEmailInput<Id>): Promise<{ jobRunId: string }>; // SEAM-AUTH-EMAIL

// @/platform/storage (server-only)
export async function putFile(input: PutFileInput): Promise<{ id: string; key: string; url: string }>;
export async function getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
export async function deleteFile(key: string): Promise<void>;
export async function createUploadUrl(input: { key: string; contentType: string; access?: FileAccess }): Promise<{ uploadUrl: string }>;
```

**Routes:** `GET /api/cron/tick` (cron secret), `GET /api/notifications/stream` (`x-user-id` header for now; replaced by session at merge), `GET /api/dev/emails/[template]` (development only).

**Notification types registered (platform):** `review.queue-waiting`, `reply.interested`, `reply.needs-action`, `meeting.booked`, `meeting.reminder`, `deal.won`, `deal.lost`, `capacity.line-full`, `job.failed`, `integration.failing`, `ai.budget-warning`, `ai.budget-exceeded`, `security.role-changed`, `security.2fa-reset`.

**Platform jobs registered:** `platform.send-email`, `platform.deliver-event`, `platform.job-runs-cleanup` (daily 02:00), `platform.retention-purge` (daily 03:00), `platform.credentials-health` (daily 06:00), `platform.notifications-digest` (daily 08:00). Every schedule is in `Africa/Lagos`.

**Settings registered (platform):** `platform.timezone`, `platform.companyName`, `platform.postalAddress`, `platform.crawlerContactUrl`, `platform.retention.personalDataMonths`, `platform.retention.jobRunsDays`, `platform.retention.auditLogMonths`, `notifications.digest.enabled`, `auth.inviteExpiryDays`, `auth.sessionDays`, `auth.googleAllowedDomains`, `ai.modelTiers`, `ai.budgets`, `ai.logContentOverrides`, `user.theme`, `user.density`, `user.reducedMotion`.

## Decisions made (and any new ADRs proposed)

- **One workflow entry for every job.** `platform.run-job` runs every job (single or workflow) through one durable step. This gives the same lifecycle handling everywhere and keeps the Vercel Workflow bundler happy (Node imports live in the step file, not the workflow file).
- **Email templates in plain HTML strings.** React Email would pull in a large runtime dependency for what is essentially inline-styled email HTML. The `renderLayout` helper keeps everything to `subject`, `html` and `text` per template, with `defaultProps` for the dev preview. Phase 18 or later can adopt React Email if a template needs a component library.
- **Local storage HMAC seed reuses `CREDENTIALS_ENCRYPTION_KEY`.** Documented as a Phase-20 hardening item — dev-only local URLs, never used in production.
- **Idempotency of `platform.deliver-event`.** The key `platform.deliver-event:<eventId>:<subscriberId>` covers job-mode subscribers without needing a separate outbox row.
- **Actor-based permission check.** `SEAM-PERMISSION`'s stand-in matches the `assertActorCan` signature (`Actor` in, `Promise<void>` out), so swapping to the real Phase 3 code at merge is a single-file removal.

No new ADRs required.

## Dependencies added

None. All required packages (`workflow`, `@vercel/blob`, `@vercel/functions`, `croner`, `pg`, `@anthropic-ai/sdk`) were installed by Phase 1. The Resend adapter uses `fetch` directly rather than a client SDK, so no extra dependency was added.

## Change requests raised

See `phases/06/REQUESTS.md`. Summary:

| ID | Type | Summary |
|---|---|---|
| CR-06-01 | config | Add the `crons` entry (`/api/cron/tick`, `*/5 * * * *`) to `vercel.json` |
| CR-06-02 | core manifest | Register platform jobs, schedules, notification types and settings on `core-manifest.ts` |
| CR-06-03 | seams (consumed) | Replace SEAM-PERMISSION stand-in with `assertCan`/`assertActorCan` from `@/platform/auth` in three call sites |
| CR-06-04 | seams (provided) | Wire SEAM-AUDIT, SEAM-AUTH-EMAIL, SEAM-AI-CREDENTIALS, SEAM-SETTINGS-AI and SEAM-NOTIFICATIONS-SHELL to the real Phase 6 exports |
| CR-06-05 | env note | Confirm `CRON_SECRET` is set on Vercel; no schema change needed |
| CR-06-06 | docs | Add short paragraphs in `platform.md` §3.6 and §3.8 pointing at the digest and retention settings |
| CR-06-07 | ownership | Confirm the Wave 1 Part A1 ownership entries for `src/workflows/_platform/**` and `src/app/api/notifications/**` |
| CR-06-08 | dev | Note that `.storage/` is already gitignored |
| CR-06-09 | contract | Add a "Recipients" sentence to `events.md` §3a stating `notify()` resolves `userIds ∪ role-holders ∪ service-line-team-profiles` |

**Seams stubbed (provider running in parallel):**
- `SEAM-PERMISSION` — Phase 3 (`assertCan`/`assertActorCan`).

**Seams Phase 6 provides for other phases:**
- `SEAM-AUDIT` (Phases 3 and 5) — `audit.record` / `withAudit`.
- `SEAM-AUTH-EMAIL` (Phase 3) — `sendEmail` with the templates in `src/emails/`.
- `SEAM-AI-CREDENTIALS` (Phase 5) — `getCredential` / `resolveProviderKey`.
- `SEAM-SETTINGS-AI` (Phase 5) — `getSetting` with `ai.modelTiers`, `ai.budgets`, `ai.logContentOverrides`.
- `SEAM-NOTIFICATIONS-SHELL` (Phase 4) — `listForUser`, `unreadCount`, `markRead`.

## Known limitations

- The **notifications stream endpoint** currently reads the user id from an `x-user-id` request header. Phase 3's session takes over at merge (SEAM-AUTH-SHELL); tests are set up to prove the shape, not the auth.
- **Direct Blob client uploads** are not implemented (`createUploadUrl` on the blob adapter rejects with a clear error). Phase 20 will switch to `createUploadUrl` from `@vercel/blob/client` for large uploads.
- **Local storage HMAC** reuses `CREDENTIALS_ENCRYPTION_KEY` as a seed. Deliberately dev-only; a dedicated `STORAGE_LOCAL_SIGN_KEY` is a Phase 20 hardening item.
- **`platform.credentials-health` provider `test()`** implementations are all mock-OK; each module phase (5, 8, 9, 10, 12, 14) adds a real `test()` when it adopts the provider.
- **`Resend` sender** uses `fetch` against `https://api.resend.com/emails`. Real deliverability (SPF/DKIM/DMARC) is a Phase 21 item; the SUMMARY note stands.
- **Prisma warns about SetSetting through a partial unique index**: for `PLATFORM`/`MODULE` scope, `setSetting` does a `findFirst`-then-`create-or-update` sequence (`createOrOnConflict` from `@/platform/db`) rather than an `upsert`, as required by project-rules.
- The **email templates** are plain HTML strings rather than React Email components. A future phase may migrate them if a template needs component composition.

## How to test it

**Ready commands (from the worktree):**

- `pnpm typecheck` — passes.
- `pnpm lint` — clean.
- `pnpm test` — 496 passing (49 files).
- `pnpm build` — succeeds; routes list includes `/api/cron/tick`, `/api/notifications/stream`, `/api/dev/emails/[template]` and the four Vercel Workflow well-known paths.
- `pnpm jobs:run platform.credentials-health '{}'` — runs the health job through the inline runner; a fresh DB reports `{ ok: 0, failing: 0 }`.
- `pnpm credentials:rotate` — refuses to run without `CREDENTIALS_ENCRYPTION_KEY_OLD`, then rotates every stored credential.

**Manual checks:**

1. `pnpm db:reset` (owner runs it — Prisma gate).
2. `pnpm dev` (serves at port 3006).
3. `curl -H "authorization: Bearer <CRON_SECRET>" http://localhost:3006/api/cron/tick` → 200 with `{ now, slot, enqueued: [...], skipped: [] }`. Without the header, 401.
4. `curl http://localhost:3006/api/dev/emails/invite` → renders the invite template.
5. In a REPL: import `saveCredential` and `getCredential` and confirm plaintext round-trip while the row on disk holds only ciphertext.
