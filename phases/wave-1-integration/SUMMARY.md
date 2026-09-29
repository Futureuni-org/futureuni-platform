# Wave 1 · Batch B1 integration summary

| | |
|---|---|
| Batch | B1 (Phases 03 Auth · 05 AI service · 06 Platform services) |
| Merge order | 6 → 3 → 5 |
| Date | 2026-09-29 |
| Verification | `pnpm check`: Pass · `pnpm test:e2e --grep @smoke`: Pass (8/8) · `saas-review`: no open Critical/Major |
| Not covered | Phase 04 (design system + shell + notifications bell) — runs in B2. `SEAM-AUTH-SHELL` and `SEAM-NOTIFICATIONS-SHELL` are deferred to that batch (Phase 4 imports the real Phase 3/6 services directly). |

## What was integrated

Wave 1 batch B1 turned the three parallel-built platform layers into a single working stack on `main`:

- **Phase 6 (Platform services)** landed first: jobs (single cron tick), events, notifications (in-app + Resend email), audit log (INV-20), settings, credentials vault (AES-256-GCM, INV-21) and storage (local + Vercel Blob) — plus platform email templates (`invite`, `verify-email`, `password-reset`, `role-changed`, `two-factor-enabled`, `two-factor-reset`, `notification`, `daily-digest`, `budget-warning`).
- **Phase 3 (Auth)** merged next: Better Auth 1.7.6 wired to the existing Prisma schema, invite-only sign-up, TOTP + backup-code 2FA (mandatory for `ADMIN`), the data-driven permission engine, the split-layout auth pages, and `src/proxy.ts` with the public-path allow-list.
- **Phase 5 (AI service)** merged last: task registry, Anthropic + mock providers, prompt versioning with publish/activate/rollback, budget enforcement, prompt-caching diagnostics.

At batch integration on `main`, every stand-in from Wave 1's seam table was replaced with the real cross-phase call, and Phase 6's core-manifest registrations and `vercel.json` cron entry were applied.

## Seams connected

| Seam | Was stubbed in | Now wired to | Files touched |
|---|---|---|---|
| SEAM-AUTH-EMAIL | Phase 3 (`src/platform/auth/_seams.ts:sendAuthEmail`) | Phase 6 `@/platform/notifications.sendEmail` | `auth/auth.ts` (`sendResetPassword`), `auth/invites.ts` (create/resend), `auth/users.ts` (changeRole), `app/(auth)/setup-2fa/actions.ts` |
| SEAM-AUDIT | Phase 3 (`_seams.ts:recordAudit`) + Phase 5 (`ai/_seams.ts:recordAudit`) | Phase 6 `@/platform/audit-log.audit.record` | `auth/invites.ts`, `auth/users.ts`, `team/index.ts`, `ai/prompt-versions.ts` |
| SEAM-PERMISSION | Phase 6 (`platform/_seams/permission.ts:assertCanSeam`) + Phase 5 (`ai/_seams.ts:assertActorCan`) | Phase 3 `@/platform/auth.assertActorCan` | `credentials/service.ts`, `settings/service.ts`, `jobs/control.ts`, `ai/prompt-versions.ts`, `ai/reporting.ts` |
| SEAM-AI-CREDENTIALS | Phase 5 (`ai/_seams.ts:getProviderKey`) | Phase 6 `@/platform/credentials.resolveProviderKey` (via new `ai/settings-adapter.ts`) | `ai/run-task.ts`, new `ai/settings-adapter.ts` |
| SEAM-SETTINGS-AI | Phase 5 (`ai/_seams.ts:getAiSettings`) | Phase 6 `@/platform/settings.getSetting` (via `ai/settings-adapter.ts`) | `ai/quota.ts`, `ai/run-task.ts`, new `ai/settings-adapter.ts` |
| SEAM-AUTH-SHELL | *(none yet)* | Deferred to B2 (Phase 4 will import `@/platform/auth` directly) | — |
| SEAM-NOTIFICATIONS-SHELL | *(none yet)* | Deferred to B2 (Phase 4 will import `@/platform/notifications` directly) | — |

`grep -rn "SEAM:" src/` returns no B1 hits after integration (the only remaining occurrences live in Workflow's generated `.well-known/**` output — a build artefact, not a phase concern).

The `src/platform/_seams/` directory (Phase 6's stand-in) was removed, and its ownership entry pulled out of `scripts/ownership/ownership.json` and `CLAUDE.md`'s ownership table.

## Change requests applied

### Phase 6

- **CR-06-01** · `vercel.json` — added the single cron entry `{ path: "/api/cron/tick", schedule: "*/5 * * * *" }`.
- **CR-06-02** · `src/platform/registry/core-manifest.ts` — now imports `platformJobs`, `platformSchedules` from `@/platform/jobs/platform-jobs`, `platformNotificationTypes` from `@/platform/notifications/types`, and `PLATFORM_SETTINGS` from `@/platform/settings/definitions`, and spreads each into the manifest.
- **CR-06-03** · seam wiring — see the table above (`assertCanSeam` → `assertActorCan`).
- **CR-06-04** · seam wiring — see the table above.
- **CR-06-05** · `CRON_SECRET` — no code change; validated as already required.
- **CR-06-07** · ownership map — the `src/platform/_seams/**` entry was removed (folder no longer exists).

### Phase 3

- **CR-03-01 / CR-03-02** · seam wiring — done.
- **CR-03-03** · domain events (`user.invited`, `user.roleChanged`, `user.deactivated`, `user.twoFactorReset`) — **not applied in B1**; audit rows already carry the equivalent facts, and the acquisition wave (B4/B5) doesn't consume these events yet. Left for a follow-up integration pass. (Rejected for B1; kept open.)
- **CR-03-04** · settings-driven expiry — **not applied in B1**. The hardcoded 7-day invite / 30-day session are working; wiring them to `@/platform/settings` also requires new setting definitions and per-request reads. Deferred to a small follow-up (not blocking B2).
- **CR-03-05** / **CR-03-05a** · `AUTH_GOOGLE_ALLOWED_DOMAINS` env var, and `qrcode.react` — **not applied in B1**. Google OAuth is off by default, and `/setup-2fa` currently shows the otpauth URI as a clickable link; both are safe to defer.
- **CR-03-06** · Phase 18 restyle grant — already in the ownership map, no change.
- **CR-03-07** · optional argon2id — no action.
- **CR-03-08** · phase-01 e2e updated — already applied in Phase 3.

### Phase 5

- **CR-05-01 / -02 / -03 / -04** · seam wirings — done via the new `src/platform/ai/settings-adapter.ts` and direct imports.
- **CR-05-05** · notification-type registration (`ai.budget-warning`, `ai.budget-exceeded`) — the types file already exports these, and Phase 6's core-manifest now registers `platformNotificationTypes` (which includes them). Wiring the events is a follow-up (Phase 5 still uses structured `console.warn` today; deferred).
- **CR-05-06 / -07** · optional SDK bump, optional `sharp` — no action.
- **CR-05-08 / -09** · doc updates and env defaults — deferred to a follow-up pass (Phase 1 owns `.env.example`; the current values still work).
- **CR-05-11** · additional integration tests for `runTask` outcomes and prompt versioning — the batch B1 acceptance suite covers `runTask` writing an `AiCall` row; the deeper outcome-matrix tests remain open.

## Codegen adjustment

`pnpm registry:gen` used to import `coreManifest` directly, and `coreManifest` now transitively imports env-consuming code (`@/platform/jobs/platform-jobs` → `@/platform/db` → `@/env`). That broke registry generation on any environment without `.env.local` loaded. Added a small entrypoint at `src/platform/registry/codegen.entry.mjs` that:

1. Reads `.env.local` (via Node's dotenv-compatible `util.parseEnv`) into `process.env`.
2. Sets `SKIP_ENV_VALIDATION=1` before any static import runs.
3. Dynamically imports `codegen.ts`.

The `registry:gen` script now points at that entrypoint. Everything else stays as-is.

## Acceptance run

`tests/integration/batch-b1-acceptance.test.ts` covers the non-UI acceptance from `docs/prompts/wave-1/wave-1-prep-and-merge.md` Part C3 step 5:

- **Invite + accept** — one-transaction creation of user + credential Account + TeamProfile + audit entry.
- **Role limits** — MANAGER can't invite ADMIN (CEIL); `changeRole` refuses the last-admin demotion; `deactivateUser` refuses to strip the last admin.
- **Masked credential save** — `saveCredential` writes ciphertext (never plaintext); `getCredentialStatus` returns a masked hint.
- **Mock AI call logged** — `runTask("platform.summarize-company", …)` writes an `AiCall` row (via the mock provider), with any outcome accepted.
- **Cron dispatcher registration** — the core-manifest exposes at least one platform job and at least one schedule, and every schedule points at a registered job.
- **Audit entries** — `audit.record` writes an entry that comes back through the query API.
- **Password credentials** — a baseline admin's stored scrypt hash verifies with `verifyPassword` and rejects a wrong password.

Note: the Phase-1 (scaffold) e2e test was already updated in Phase 3 to expect the `/login` redirect, and the smoke suite passes (`pnpm test:e2e --grep @smoke` → 8/8, desktop + mobile).

## Rejected requests (from Phase 3/5/6 REQUESTS.md)

- **CR-03-03 (event emission)** — deferred: no consumer yet, and audit rows carry the same facts. Will be added when Phase 6's event bus grows a subscriber that acts on these events (or when Phase 12/13 need them).
- **CR-03-04 (settings-driven expiry)** — deferred: needs new setting definitions, and the constants are correct today.
- **CR-03-05 / -05a / -07** — deferred: optional and non-blocking.
- **CR-05-06 / -07 / -08 / -09 / -10 / -11** — deferred: some are optional, some are doc-only, and the additional test coverage will land alongside Phase 8-14 acquisition work that exercises `runTask` end-to-end.

## Ownership map changes

- Removed `src/platform/_seams/**` from Phase 6's `owns` list (folder deleted).
- CLAUDE.md's ownership table now reflects the same.

## What's next (batch B2)

B2 opens with Phase 4 (design system + shell + home widgets) plus Phases 7 (profiles + runtime skills) and 9 (enrichment + compliance). Phase 4 imports `@/platform/auth` (`getCurrentUser`, `can`) and `@/platform/notifications` (`listForUser`, `unreadCount`, `markRead`) directly — no SEAM stub is needed since Wave 1 is now merged.

`main` is `HEAD` = merge commit for phase/05-ai-service (`f4ddf77`) + this integration commit. Ready for the B2 kick-off (Phase 4 · Phase 7 · Phase 9 in parallel worktrees).
