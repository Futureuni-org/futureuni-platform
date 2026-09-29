# Phase 03 change requests

Each entry describes a change that lives outside `src/platform/auth/**`, `src/platform/team/**`, `src/app/(auth)/**`, `src/app/api/auth/**`, `src/proxy.ts`, `src/middleware.ts`, or `tests/e2e/phase-01/**` (Phase 03's `alsoAllow`). Applied at the Wave 1 integration session (Part C3 of `docs/prompts/wave-1/wave-1-prep-and-merge.md`).

---

## CR-03-01 · Seam wiring — SEAM-AUTH-EMAIL → `@/platform/notifications`

- **Kind:** seam wiring (Phase 6 provider).
- **Where the stand-in lives:** `src/platform/auth/_seams.ts` (`sendAuthEmail`).
- **What to change at merge:**
  1. Delete `sendAuthEmail` from `src/platform/auth/_seams.ts`.
  2. Add a matching `sendAuthEmail(input: AuthEmailInput)` in `src/platform/notifications/` (Phase 6) that renders each template through the React Email + Resend adapter (ADR-023) and sends it. Templates map:
     - `invite` → `emails/InviteEmail.tsx`
     - `verify-email` → `emails/VerifyEmail.tsx`
     - `password-reset` → `emails/PasswordResetEmail.tsx`
     - `role-changed` → `emails/RoleChangedEmail.tsx` (delivered as the critical `security.role-changed` notification per `docs/contracts/events.md`)
     - `2fa-enabled` → `emails/TwoFactorEnabledEmail.tsx`
  3. Update every import of `_seams` for `sendAuthEmail` to import from `@/platform/notifications` instead:
     - `src/platform/auth/auth.ts` (`emailAndPassword.sendResetPassword`)
     - `src/platform/auth/invites.ts` (`createInvite`, `resendInvite`)
     - `src/platform/auth/users.ts` (`changeRole`)
     - `src/app/(auth)/setup-2fa/actions.ts` (`verifyEnable2FA`)
  4. Confirm `grep -r "SEAM:SEAM-AUTH-EMAIL" src` returns nothing.

## CR-03-02 · Seam wiring — SEAM-AUDIT → `@/platform/audit-log`

- **Kind:** seam wiring (Phase 6 provider).
- **Where the stand-in lives:** `src/platform/auth/_seams.ts` (`recordAudit`).
- **What to change at merge:**
  1. Delete `recordAudit` from `_seams.ts`.
  2. Re-export a matching `recordAudit(tx: Tx | null, entry: AuditEntry)` from `@/platform/audit-log` (Phase 6). The Phase 6 implementation may add rate limiting, redaction, and structured emission; the signature stays identical.
  3. Update every import (search `recordAudit`):
     - `src/platform/auth/invites.ts`, `users.ts`, `_seams` re-export site.
     - `src/platform/team/index.ts`.
     - `src/app/(auth)/**` (none currently; keep this row for future audit calls).
  4. Confirm `grep -r "SEAM:SEAM-AUDIT" src` returns nothing.

## CR-03-03 · Emit `user.invited`, `user.roleChanged`, `user.deactivated`, `user.twoFactorReset` events

- **Kind:** seam wiring / event bus.
- **Motivation:** `docs/contracts/events.md` declares these envelope names with routing to critical notifications (`security.role-changed`, `security.2fa-reset`). Phase 3 records the equivalent facts through `SEAM-AUDIT` and returns them from services, but does not yet call `@/platform/events`. Phase 6 owns the event bus.
- **What to change at merge:**
  1. In `invites.ts` `createInvite`, after the audit entry, publish `{ name: "user.invited", inviteId, role, invitedBy }`.
  2. In `users.ts` `changeRole`, after the audit entry, publish `{ name: "user.roleChanged", userId, from, to }`.
  3. In `users.ts` `deactivateUser`, publish `{ name: "user.deactivated", userId }`.
  4. In `users.ts` `resetUser2FA`, publish `{ name: "user.twoFactorReset", userId }`.
  5. Update the Phase 03 SUMMARY's "Public interfaces" section with the emitted events.

## CR-03-04 · Settings-driven invite expiry and session length

- **Kind:** setting integration (Phase 6 provider).
- **Motivation:** `auth.inviteExpiryDays` and `auth.sessionDays` are declared in `docs/specs/platform.md`. Phase 3 hardcodes them (`INVITE_EXPIRY_DAYS = 7`; Better Auth `session.expiresIn = 30 days`). Wire them to `@/platform/settings` once Phase 6 lands.
- **What to change at merge:** replace the constants in `src/platform/auth/invites.ts` and the `session` block in `auth.ts` with `await getSetting("auth.inviteExpiryDays")` and `await getSetting("auth.sessionDays")` and add matching `defineSetting` entries to the core manifest.

## CR-03-05a · Add `qrcode.react` runtime dependency

- **Kind:** dependency addition (Phase 1 ownership over `package.json`).
- **Motivation:** `/setup-2fa` shows the TOTP setup as a clickable `otpauth://` link and a manual code today because Phase 3 doesn't own `package.json`. Adding a QR code image would be more scannable on desktop (phone camera).
- **What to change at merge:** `pnpm add qrcode.react` (~7 KB), then replace the `<a href={stage.totpUri}>` block in `src/app/(auth)/setup-2fa/setup-form.tsx` with `<QRCodeSVG value={stage.totpUri} size={176} />`. Keep the fallback link for accessibility.

## CR-03-05 · Google OAuth allowed-domain list env variable

- **Kind:** environment schema (`src/env.ts`) + `.env.example` addition.
- **What to change at merge:**
  1. Add `AUTH_GOOGLE_ALLOWED_DOMAINS` to `.env.example` with the comment:
     ```
     # Comma-separated list of email domains allowed for Google sign-in (ADR-013).
     # Empty (default) means every Google account is rejected even when AUTH_GOOGLE_ENABLED=true.
     AUTH_GOOGLE_ALLOWED_DOMAINS=""
     ```
  2. In `src/env.ts`, add `AUTH_GOOGLE_ALLOWED_DOMAINS: optional(text())` next to `AUTH_GOOGLE_ENABLED`. Ideally validate it as a comma-separated list of domains.
  3. Replace `process.env.AUTH_GOOGLE_ALLOWED_DOMAINS` in `src/platform/auth/auth.ts` with the validated `env.AUTH_GOOGLE_ALLOWED_DOMAINS`.

## CR-03-06 · Phase 18 restyle grant on `src/app/(auth)/**`

- **Kind:** ownership grant.
- **Motivation:** Phase 18 replaces the local primitives in `src/app/(auth)/_components/` with the shared design system components (behaviour unchanged). The ownership map already lists `src/app/(auth)/**` as an `alsoAllow` for Phase 18 (`scripts/ownership/ownership.json`). No change is required; this entry documents the arrangement.

## CR-03-07 · Optional — Argon2id password hashing

- **Kind:** cryptography follow-up.
- **Motivation:** Better Auth's default password hasher is scrypt (built-in, no native deps). Phase 3 keeps that default, matching the phase prompt's "argon2 or bcrypt, per the library" wording. Some teams prefer argon2id for its memory-hardness. If Prince wants argon2id, add `@node-rs/argon2` to dependencies (with a `pnpm-workspace.yaml` `allowBuilds` entry), and override `emailAndPassword.password.hash/verify` in `auth.ts`. This request stays open; no automatic action at merge.

## CR-03-08 · Phase-01 e2e smoke test updated

- **Kind:** grant already exercised.
- **Motivation:** `tests/e2e/phase-01/scaffold.spec.ts` was updated in Phase 3 to expect the `/login` redirect. Phase 4 will refresh the login shell; the redirect contract stays the same. Documented here for the integration session's log.
