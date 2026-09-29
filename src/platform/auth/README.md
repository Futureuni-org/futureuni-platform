# `@/platform/auth` — Phase 3

Authentication, authorization, invites, users. The single import point for every downstream phase (5, 6, 7, …). All exports are `server-only`.

```ts
import {
  // Session
  getCurrentUser, requireUser, requireRole, requirePermission,
  // Permission evaluator
  can, assertCan, assertActorCan, explainCan, actorOf,
  // Password + redirect helpers used by auth pages
  safeNext, checkPassword, PASSWORD_MIN_LENGTH,
  // Types
  type CurrentUser,
} from "@/platform/auth";
```

## Session lookup

- **`getCurrentUser()`** — reads the Better Auth session cookie, joins `User` and `TeamProfile`, and returns a plain `CurrentUser` (never the password hash, session token, or 2FA secret). Memoised per request with React `cache()`, so an RSC render tree pays the cost once. Returns `null` for anonymous or deactivated users.
- **`requireUser()`** — same as `getCurrentUser`, but redirects to `/login?next=<path>` in RSC and server actions when there is no session. `next` comes from the `x-next-pathname` header the proxy sets. Throws `AppError("UNAUTHENTICATED")` if `redirect()` can't run.
- **`requireRole(...roles)`** — `requireUser` + hard role gate. Throws `AppError("FORBIDDEN")` otherwise.
- **`requirePermission(action, resource?)`** — `requireUser` + `assertCan`. Preferred over `requireRole` because scopes are data-driven.
- **`canFromUser(user | null, action, resource?)`** — convenience boolean for UI branches (server-side; the server action still calls `assertCan`).

## Permission engine (`permissions.ts`)

Deny-by-default. Actions are read from `getAllPermissions()` (module registry). A deactivated user is denied everything. Scope semantics:

| Scope | Rule |
|---|---|
| `ALL` | Allowed on any resource. |
| `LINES` | `resource.serviceLine ∈ user.serviceLines`; missing → deny. |
| `OWN` | `ownerId === user.id` **and** `serviceLine ∈ user.serviceLines`; missing → deny. |
| `OWN+A` | `OWN` **and** `user.canApprove`. |
| `SELF` | `resource.userId === user.id`; missing → deny. |
| `CEIL` | Target role rank ≤ actor rank, and never `ADMIN`. |
| `NONE` | Denied. |

Registered actions are cached the first time the module runs; call `_resetPermissionCache()` from tests to force a fresh read.

For jobs and subscribers (SYSTEM `Actor`), `assertActorCan` looks up the registered job's `systemActions` and rejects anything else. The job itself was authorised when it was enqueued.

## Invites (`invites.ts`)

`createInvite`, `revokeInvite`, `resendInvite`, `acceptInvite`. Tokens are 32-byte random values printed as base64url and stored as SHA-256 hex; nothing accepts a plaintext token from the database. `acceptInvite` runs the whole flow in **one transaction**:

1. Look up the invite by hash, unused, not revoked, not expired.
2. Create `User` (or reactivate) with the invited role, `mustSetUp2fa = role === "ADMIN"`.
3. Create the credential `Account` with Better Auth's `hashPassword` (scrypt).
4. Create `TeamProfile` with the invited service lines.
5. Mark the invite used.
6. Write an audit entry through SEAM-AUDIT.

Rate limits: 20 invite creates / hour per actor, 10 accepts / hour per IP. These share the `rate_limits` table Better Auth uses for its own endpoints.

## User administration (`users.ts`)

`listUsers`, `changeRole`, `deactivateUser`, `reactivateUser`, `resetUser2FA`, `forceSignOut`. Every mutation:

- calls `assertCan` against the .claude/project-rules matrix,
- refuses to leave the platform with zero active admins,
- deletes the target's sessions in the same transaction on any role/status change,
- writes an audit entry through SEAM-AUDIT.

Role changes and 2FA resets flip `mustSetUp2fa` back to true when the target becomes `ADMIN`.

## Seams (`_seams.ts`)

Two Wave 1 seams the phase depends on:

- **`SEAM-AUTH-EMAIL` — `sendAuthEmail`** — logs a JSON line to stdout in development (and appends to `.storage/test/auth-emails.jsonl` in test). Never logs links in production. Wired to `@/platform/notifications` at merge (CR-03-01).
- **`SEAM-AUDIT` — `recordAudit(tx, entry)`** — writes directly to `AuditLog`. Wired to `@/platform/audit-log` at merge (CR-03-02).

## Route protection

- `src/proxy.ts` redirects unauthenticated `(platform)` requests to `/login?next=<path>` and passes the pathname through as `x-next-pathname`. Public paths (`/login*`, `/invite/*`, `/reset*`, `/signed-out`, `/api/auth/*`, `/api/health`, `/api/cron/*`, `/api/webhooks/*`, `/api/unsubscribe/*`, `/u/*`, `/.well-known/*` including Workflow's `.well-known/workflow/*`) pass straight through.
- **The proxy is not the security control.** Every server action and route handler calls `requireUser` / `requirePermission` on its own.

## Testing

- `permissions.fixture.ts` mirrors the .claude/project-rules matrix. `permissions.test.ts` walks every (action × role × resource case), so any drift between project-rules, the manifest, or the fixture fails the suite.
- `redirect.test.ts`, `password.test.ts`, `tokens.test.ts` cover the small utilities.
- `tests/e2e/phase-03/` covers sign-in error paths and the unauthenticated redirect.
