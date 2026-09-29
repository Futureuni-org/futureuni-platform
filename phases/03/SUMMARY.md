# Phase 03: Auth, Users, Roles and Team — Summary

| | |
|---|---|
| Phase | 03, Auth and team |
| Branch | `phase/03-auth` |
| Batch / wave | B1 / Wave 1 |
| Date finished | 2026-09-29 |
| Prompt | `docs/prompts/wave-1/phase-03-auth.md` |
| Verification | `pnpm check`: Pass · `pnpm test:e2e --grep @smoke`: Pass (8/8, desktop + mobile) · `saas-review`: 2 Major findings fixed (team scope with multiple lines · rate-limit race); no open Critical or Major |

## What was built

Identity and access for the FUTUREUNI platform: Better Auth 1.7.6 configured with the Prisma adapter over the schema Phase 2 shipped, invite-only sign-up with a token flow that creates User + credential Account + TeamProfile in one transaction, TOTP + backup-code 2FA (mandatory for `ADMIN` via `mustSetUp2fa`), a purely data-driven permission engine that reads `getAllPermissions()` from the module registry, and on-brand split-layout auth pages for /login, /login/2fa, /invite/[token], /reset(/[token]), /setup-2fa and /signed-out. Every downstream phase now imports `@/platform/auth` for `getCurrentUser`/`requireUser`/`assertCan`/`actorOf`. The proxy redirects unauthenticated visitors on any `(platform)` route to `/login?next=…` (same-origin only; open-redirect safe). Team-profile services expose `getTeamProfile`, `listTeam`, `updateTeamProfile`, `recalculateLoad`, `getLineCapacity` and `isLineAtCapacity`. Every mutation goes through `assertCan` and writes to the audit log via the SEAM-AUDIT stand-in, and every session-rotating action (`changeRole`, `deactivateUser`, `resetUser2FA`, `forceSignOut`) revokes the target's sessions in-transaction. Meets `docs/specs/platform.md` §Sessions/§Team profile/§Core routes R-1..R-7 and every `platform.*` line of the permission matrix.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/platform/auth/auth.ts` | Better Auth instance (Prisma adapter, `twoFactor()`, `admin()`, `nextCookies()`, DB rate limiter, secure cookies, Google OAuth behind allow-listed domains). |
| `src/platform/auth/session.ts` | `getCurrentUser` (React `cache()`), `requireUser`, `requireRole`, `requirePermission`, `canFromUser`. |
| `src/platform/auth/permissions.ts` | Deny-by-default matrix evaluator: `can`, `assertCan`, `assertActorCan`, `explainCan`, `actorOf`. |
| `src/platform/auth/permissions.fixture.ts` + `permissions.test.ts` | Fixture copied from `.claude/project-rules.md`; walker asserts fixture ↔ manifest parity plus `can()` behaviour for every (action × role × resource case). |
| `src/platform/auth/invites.ts` | `createInvite`, `revokeInvite`, `resendInvite`, `acceptInvite` (one-transaction accept path). |
| `src/platform/auth/users.ts` | `listUsers`, `changeRole`, `deactivateUser`, `reactivateUser`, `resetUser2FA`, `forceSignOut` — last-admin protection, session rotation, audit writes. |
| `src/platform/auth/password.ts` + `.test.ts` | 12-char minimum, common-password list, lightweight strength meter. |
| `src/platform/auth/redirect.ts` + `.test.ts` | `safeNext` (same-origin relative only; auth paths rejected). |
| `src/platform/auth/rate-limit.ts` | Consume helper on top of the `rate_limits` table for server actions Better Auth's own limiter doesn't cover (invite create/accept). |
| `src/platform/auth/tokens.ts` + `.test.ts` | 32-byte random tokens; SHA-256 hex hashing. |
| `src/platform/auth/_seams.ts` | `SEAM-AUTH-EMAIL` (`sendAuthEmail`) + `SEAM-AUDIT` (`recordAudit`) stand-ins. |
| `src/platform/auth/seed.ts` | Attaches credential Accounts to Phase 2's 8 seeded users, forces ADMIN `mustSetUp2fa` unless `SEED_SKIP_2FA=true`, seeds 2 pending + 1 expired + 1 known-dev invite. |
| `src/platform/auth/index.ts` | The single import for every downstream phase. |
| `src/platform/team/index.ts` + `team.repo.ts` + README | Team profile services and repo. |
| `src/app/(auth)/layout.tsx` + `/_components/**` | Split-layout brand panel + local form primitives (Field, TextInput, PrimaryButton, ErrorBanner, InfoBanner, PasswordInput). |
| `src/app/(auth)/login/{page,actions,login-form}.tsx` | Email + password sign-in with 2FA and mustSetUp2fa routing. |
| `src/app/(auth)/login/2fa/{page,actions,two-factor-form}.tsx` | TOTP + backup-code verification. |
| `src/app/(auth)/invite/[token]/{page,actions,accept-form}.tsx` | Accept-invite flow. |
| `src/app/(auth)/reset/{page,actions,request-form}.tsx` and `reset/[token]/{page,reset-form}.tsx` | Password reset (never enumerates emails). |
| `src/app/(auth)/setup-2fa/{page,actions,setup-form}.tsx` | Enable 2FA (QR + verify + backup codes shown once). |
| `src/app/(auth)/signed-out/page.tsx` | Post-sign-out confirmation page. |
| `src/app/api/auth/[...all]/route.ts` | Better Auth catch-all handler. |
| `src/proxy.ts` | Next.js 16 proxy: public paths allow-list + `(platform)` redirect + `x-next-pathname` header + `.well-known/workflow/**` exclusion. |
| `tests/e2e/phase-01/scaffold.spec.ts` | Updated (grant CR-01-01) to expect the `/login` redirect. |
| `tests/e2e/phase-03/signin.spec.ts` | Wrong-password generic error + protected-route redirect. |
| `phases/03/REQUESTS.md`, `SUMMARY.md` | Wave 1 integration inputs. |

## Public interfaces other phases can use

```ts
// @/platform/auth
export type CurrentUser = {
  id: string; name: string; email: string; image: string | null;
  role: Role; serviceLines: ServiceLine[]; canApprove: boolean;
  timezone: string; twoFactorEnabled: boolean;
  status: "ACTIVE" | "DEACTIVATED"; mustSetUp2fa: boolean;
};
export function getCurrentUser(): Promise<CurrentUser | null>;
export function requireUser(): Promise<CurrentUser>;                 // redirects in RSC/actions
export function requireRole(...roles: Role[]): Promise<CurrentUser>;
export function requirePermission(action, resource?): Promise<CurrentUser>;
export function can(user, action, resource?): boolean;
export function assertCan(user, action, resource?): void;            // throws AppError("FORBIDDEN")
export function assertActorCan(actor, action, resource?): Promise<void>;
export function actorOf(user): Actor;

// @/platform/auth/invites
export function createInvite(actor, { email, role, serviceLines }): Promise<{ id, email, role, expiresAt, link }>;
export function revokeInvite(actor, inviteId): Promise<void>;
export function resendInvite(actor, inviteId): Promise<{ ... link }>;
export function acceptInvite({ token, name, password }, meta?): Promise<{ userId, email, role }>;

// @/platform/auth/users
export function listUsers(actor, input): Promise<{ items, nextCursor }>;
export function changeRole(actor, { userId, newRole }): Promise<void>;
export function deactivateUser(actor, userId): Promise<void>;
export function reactivateUser(actor, userId): Promise<void>;
export function resetUser2FA(actor, userId): Promise<void>;
export function forceSignOut(actor, userId): Promise<void>;

// @/platform/team
export function getTeamProfile(actor, userId): Promise<TeamProfileRow>;
export function listTeam(actor, { serviceLine?, role? }): Promise<TeamUserRow[]>;
export function updateTeamProfile(actor, userId, patch): Promise<TeamProfileRow>;
export function recalculateLoad(userId): Promise<number>;
export function getLineCapacity(serviceLine): Promise<LineCapacity>;
export function isLineAtCapacity(serviceLine): Promise<boolean>;
```

Every mutation calls `assertCan` against the .claude/project-rules matrix and writes to `AuditLog` through SEAM-AUDIT.

## Decisions made (and any new ADRs proposed)

- **Password hashing:** kept Better Auth's default **scrypt** (built-in, no native deps). This matches the phase prompt's "argon2 or bcrypt, per the library" wording. Argon2id is optionally documented as CR-03-07.
- **Strength meter:** lightweight heuristic (length + character-class diversity + common-password list) — avoids the ~150 KB gzipped zxcvbn bundle for what is a staff-only sign-in.
- **Google OAuth allow-list:** env-driven (`AUTH_GOOGLE_ALLOWED_DOMAINS`, added at merge via CR-03-05). Simpler than a settings row; matches "leave off by default behind an env flag" in the prompt.
- **Sessions revoked on role/status change:** direct `db.session.deleteMany` inside the same transaction as the user update. Better Auth's own `admin.revokeUserSessions` endpoint isn't needed and would require an active admin session.
- **`requireUser` redirect strategy:** in an RSC / server action, `next/navigation.redirect("/login?next=…")` is thrown; the proxy passes through `x-next-pathname` so a same-origin `next` param survives without another round-trip.
- **The proxy is not the security control:** every server action, RSC and route handler still calls `requireUser` / `requirePermission` on its own.

## Dependencies added

None. `qrcode.react` was considered for `/setup-2fa` but reverted because Phase 3 doesn't own `package.json`; the setup screen shows the `otpauth://` URI as a clickable link and a manual code instead, and CR-03-05a in `REQUESTS.md` asks Phase 1 to add the dep at merge.

Better Auth 1.7.6 was already installed by Phase 1. Everything else is stdlib (`node:crypto`).

## Change requests raised

- **CR-03-01 · SEAM-AUTH-EMAIL wiring** — stub in `_seams.ts`; Phase 6 replaces with `@/platform/notifications`.
- **CR-03-02 · SEAM-AUDIT wiring** — stub in `_seams.ts` writes directly to `AuditLog`; Phase 6 replaces with `@/platform/audit-log`.
- **CR-03-03 · Emit domain events** — `user.invited`, `user.roleChanged`, `user.deactivated`, `user.twoFactorReset` — added at merge once `@/platform/events` lands.
- **CR-03-04 · Settings-driven expiry** — replace the hardcoded 7-day invite expiry / 30-day session with `@/platform/settings` reads (Phase 6).
- **CR-03-05a · `qrcode.react` runtime dependency** — added at merge (Phase 1 owns `package.json`).
- **CR-03-05 · `AUTH_GOOGLE_ALLOWED_DOMAINS` env var** — schema and `.env.example` addition (Phase 1 ownership).
- **CR-03-06 · Phase 18 restyle grant** — already in `ownership.json`; documented for the log.
- **CR-03-07 · (Optional)** Argon2id password hashing follow-up.
- **CR-03-08 · Phase-01 smoke test updated** — grant exercised; login redirect asserted.

**Seams:**

- SEAM-AUTH-EMAIL: **stubbed** (Phase 6 running in parallel).
- SEAM-AUDIT: **stubbed** (Phase 6 running in parallel).
- SEAM-PERMISSION (provided): Phases 5 and 6 stub `assertCan`; the real one from `@/platform/auth/permissions` is what they wire to at merge.
- SEAM-AUTH-SHELL (provided): Phase 4 imports `getCurrentUser`/`can` at merge.

## Known limitations

- **No admin/team UI** in this phase — Phase 18 builds the screens on top of these services (per the phase prompt).
- **Email links** are logged to stdout by the SEAM-AUTH-EMAIL stand-in in development, and additionally appended to `.storage/test/auth-emails.jsonl` when `NODE_ENV="test"` so Playwright can grab them. Production links are only sent through Resend (via CR-03-01 at merge). Never logged in production.
- **Invite/session expiry are hardcoded** at 7 days / 30 days — CR-03-04 wires them to platform settings.
- **Domain events (`user.*`) are not emitted yet** — Phase 6 provides `@/platform/events`; CR-03-03 covers the wiring.
- **Better Auth's Google OAuth `hd` hint** is not set in `auth.ts` because Google's `hd` is only advisory. The `mapProfileToUser` allow-list is the enforcement. Google sign-in is off by default (`AUTH_GOOGLE_ENABLED=false`).
- **saas-review** — completed on this branch; two Major findings were fixed (see below). No Critical or Major left open.

## How to test it

Prerequisites: native Postgres 18 running (`pnpm db:up`), `.env.local` present with `SEED_USER_PASSWORD` set to at least 12 characters (default: `changeme-local-only-12`).

```bash
pnpm db:reset      # or: pnpm db:deploy && pnpm db:seed — user must consent to `db:reset` on Prisma 7
pnpm typecheck && pnpm lint && pnpm test
pnpm build
pnpm dev
# Then:
#   http://localhost:3000/           -> redirects to /login
#   Sign in as admin@futureuni.local / <SEED_USER_PASSWORD>
#   Complete /setup-2fa (scan QR, verify, save backup codes)
#   /login/2fa is served on next sign-in
#   Try /settings while signed out -> /login?next=%2Fsettings
```

The dev invite token is `development-invite-token-with-enough-length-to-pass-min-check` for `dev.invite@futureuni.local`, so `/invite/development-invite-token-with-enough-length-to-pass-min-check` renders the accept-invite form without checking a seed email.

Playwright suite (requires the dev server): `pnpm test:e2e --grep @smoke` runs the scaffold redirect + phase-03 sign-in smoke tests.
