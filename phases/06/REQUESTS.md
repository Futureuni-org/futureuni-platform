# Phase 06 change requests

Applied on `main` during the Wave 1 integration (`docs/prompts/wave-1/wave-1-prep-and-merge.md` Part C3).
Reject anything with a clear reason.

---

## CR-06-01 (config): Add the single Vercel Cron entry

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "*/5 * * * *" }
  ]
}
```

Reason: ADR-033 and `docs/contracts/jobs.md` rule 5. One entry drives every schedule.

---

## CR-06-02 (core manifest): Register platform jobs, schedules, notification types and settings

Edit `src/platform/registry/core-manifest.ts` to include:

- `jobs: [...platformJobs]` from `@/platform/jobs/platform-jobs`
- `schedules: [...platformSchedules]` from `@/platform/jobs/platform-jobs`
- `notificationTypes: [...platformNotificationTypes]` from `@/platform/notifications/types`
- `settings: [...PLATFORM_SETTINGS]` from `@/platform/settings/definitions`

Reason: `docs/contracts/module-manifest.md` §Rules 3–8 — platform-scope items live on the core
manifest, and Phase 6 does not own that file.

---

## CR-06-03 (seams): Replace SEAM-PERMISSION with the real check

At merge, delete `src/platform/_seams/permission.ts` and re-point every import of `assertCanSeam`
to `assertCan` (for a `PermissionSubject`) or `assertActorCan` (for an `Actor`) from
`@/platform/auth`. Files touching the seam:

- `src/platform/credentials/service.ts`
- `src/platform/settings/service.ts`
- `src/platform/jobs/control.ts`

The `assertCanSeam(actor, action, resource?)` signature is intentionally the same as
`assertActorCan`, so the change is a one-line import swap plus removing the file.

---

## CR-06-04 (seams provided): Wire Phase 3, 4 and 5 stand-ins to the real Phase 6 code

- **SEAM-AUDIT** (Phases 3 and 5) → `@/platform/audit-log` `audit.record(txOrNull, entry)` and
  `withAudit(tx, entry, fn)`.
- **SEAM-AUTH-EMAIL** (Phase 3) → `@/platform/notifications` `sendEmail({ to, template, props,
  dedupeKey? })`. The email templates `invite`, `verify-email`, `password-reset`, `role-changed`,
  `two-factor-enabled`, `two-factor-reset` are in `src/emails/`.
- **SEAM-AI-CREDENTIALS** (Phase 5) → `@/platform/credentials` `getCredential(providerId)` (or
  `resolveProviderKey(providerId)` for string API keys).
- **SEAM-SETTINGS-AI** (Phase 5) → `@/platform/settings` `getSetting(key, { userId? })`. The AI
  keys are registered as `ai.modelTiers`, `ai.budgets` and `ai.logContentOverrides`.
- **SEAM-NOTIFICATIONS-SHELL** (Phase 4) → `@/platform/notifications` `listForUser`,
  `unreadCount`, `markRead`. Server components should compute counts on the server and pass plain
  data to the client bell.

Every signature matches the wave-1 seam table verbatim.

---

## CR-06-05 (env note, no code change): CRON_SECRET is required

`src/env.ts` already declares `CRON_SECRET` as a required secret. Confirm during merge that
Vercel's cron requests carry `Authorization: Bearer ${CRON_SECRET}` (verified with Context7 by
the merge session). No env schema change is needed.

---

## CR-06-06 (docs): Note the digest schedule and retention defaults in `docs/specs/platform.md`

Add a short paragraph in §3.6 pointing at `notifications.digest.enabled` and in §3.8 at
`platform.retention.jobRunsDays` (default 30) and `platform.retention.auditLogMonths` (default
null → keep indefinitely, OQ-6).

---

## CR-06-07 (ownership): `src/workflows/_platform/**` and `src/app/api/notifications/**`

Already listed for Phase 6 by Part A1. Confirm entries exist in `scripts/ownership/ownership.json`.

---

## CR-06-08 (dev): `.storage/` is already gitignored (Phase 1). No change.

The local storage adapter writes to `.storage/<key>`. Phase 1's `.gitignore` already excludes
`.storage/`, so no ownership request is needed.

---

## CR-06-09 (contract, minor): `notify()` recipient resolution accepts `role` and `serviceLine`

`docs/contracts/events.md` §3a implies role/line resolution but doesn't spell it out. `notify()`
resolves recipients from `userIds ∪ users-with-role ∪ team-profiles-with-serviceLine`. Add one
sentence to `docs/contracts/events.md` §3a "Recipients" that matches the implementation.

---

## Rejected: none.

## Notes for later phases

- **Phase 12** (outreach): add outreach-mailbox providers to the credentials vault by extending
  `providerEnvKey` / `getProvider`. The `outreach-mailbox:<id>` id shape is already in
  `ProviderIdSchema`.
- **Phase 18** (admin UI): calls `listCredentialStatuses`, `listAudit`, `listJobRuns`,
  `listSettings`, `notify` preferences; every result is already permission-checked.
- **Phase 20** (hardening): swap the local adapter's HMAC signing seed for a dedicated secret,
  and switch Blob to `createUploadUrl` from `@vercel/blob/client` for large uploads.
