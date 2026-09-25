# Phase 3: Auth, Users, Roles and Team

> **How to run this phase**
> 1. Wave 0 must be merged, and Part A of `wave-1-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 03 auth`, then open Claude Code in the new worktree folder. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-03-auth.md and execute it. Plan first."**
>
> Wave 1. Runs in parallel with Phases 4, 5 and 6. Depends on Phases 0–2.

---

## Your role and the goal of this phase

You are building **identity and access** for the FUTUREUNI Internal Platform, following the `saas-auth` skill. By the end of this phase:

- staff can sign in, but only by invitation, because there's no public signup
- every server action and route can ask "who is this and what may they do?" through one small API
- the permission map from project-rules is implemented once and used everywhere
- each user has a team profile (service lines, weekly capacity, current load, timezone) that other modules read

**What's not in this phase:**

- **Admin screens for managing users and team.** Those are Phase 18. You build the **services and server actions** they'll call, fully tested.
- **The polished design system.** That's Phase 4, running in parallel. Your auth pages use the semantic tokens Phase 1 created, with small local primitives kept in your own folder. Phase 18 swaps them for shared components later.

---

## Step 0: Read first

1. `CLAUDE.md`
2. `.claude/project-rules.md`, especially "Roles and permissions" (the full matrix), "Domain invariants" and "Bans"
3. `docs/specs/platform.md`: roles, the team profile, and core routes
4. `docs/contracts/permissions.md` and `src/contracts/permissions.ts`
5. `docs/decisions.md`: the auth library ADR
6. `phases/README.md`, `phases/00..02/SUMMARY.md` and `docs/prompts/wave-1-prep-and-merge.md` (Part B, your seams)
7. The Prisma models in `prisma/schema/auth.prisma` and `core.prisma` (`User`, `Invite`, `TeamProfile`, `AuditLog`)
8. `src/platform/registry/`, for `getAllPermissions()`
9. The global skills `saas-auth` (and all its references), `saas-api` (the handler shape), `saas-testing` and `saas-review`

Use Context7 to check the **current** docs for the chosen auth library: its Next.js App Router integration, the Prisma adapter, email/password, invitations or admin plugins, 2FA/TOTP, rate limiting, and session cookies. Also check the current Next.js convention for request middleware (`middleware.ts` or `proxy.ts`).

---

## What you own

- `src/platform/auth/**`
- `src/platform/team/**`
- `src/app/(auth)/**`
- `src/app/api/auth/**`
- the Next.js middleware/proxy file
- `phases/03/**`

**Schema changes aren't allowed.** Phase 2 created the auth tables. If the library needs something missing, write it to `phases/03/REQUESTS.md` with the exact Prisma change. In the meantime, work around it without the field if you can.

---

## Step 1: Auth library setup

1. Configure the chosen auth library with the Prisma adapter against the existing tables.
2. **Sign-in methods:**
   - Email and password.
   - Optionally, Google sign-in restricted to an allowed domain list stored in settings. Build it, but leave it off by default behind an env flag.
3. **No public signup.** Accounts are created only by accepting an invite. The signup endpoint must reject requests without a valid invite token.
4. **Sessions:**
   - secure, httpOnly, `sameSite=lax` cookies
   - rotated on sign-in and on any role or permission change
   - 30 days with sliding renewal, configurable
   - "Sign out of all devices" is supported
5. **Passwords:**
   - hashed with argon2 or bcrypt, per the library
   - minimum 12 characters, with a strength meter on the form
   - checked against a small built-in list of common passwords
6. **2FA with TOTP:**
   - available to everyone
   - **required for `ADMIN`**: an admin without 2FA is sent to 2FA setup after signing in
   - backup codes are generated once and shown once
7. **Rate limiting** on sign-in, password reset, invite acceptance and 2FA verification. Use the library's database-backed limiter. If it needs a table that doesn't exist, raise a schema request and use an in-memory limiter behind the same interface until then.
8. **Error messages never reveal** whether an email exists. Reset requests always respond "If that account exists, we've sent a link."

---

## Step 2: Invites

- **Invite service** in `src/platform/auth/invites.ts`:
  - `createInvite({ email, role, serviceLines, invitedBy })`
  - `revokeInvite`
  - `resendInvite`
  - `acceptInvite({ token, name, password })`
- **Tokens:**
  - random, single-use
  - expire after 7 days (configurable)
  - stored hashed
- **Accepting an invite, in one transaction:**
  - creates the user with the invited role
  - creates their `TeamProfile` with the invited service lines and default capacity
  - marks the invite used
  - records an audit entry through `SEAM-AUDIT`
- **Rules:**
  - Only roles allowed by the permission map may invite, and nobody can invite at a role higher than their own.
  - A `MANAGER` can't create an `ADMIN`.
  - Inviting an existing active email fails with a clear, non-leaking message.
- **Emails** (invite, verification, password reset, "your role changed") are sent through `SEAM-AUTH-EMAIL`. Its fixed signature:

  ```ts
  // src/platform/auth/_seams.ts
  // SEAM:SEAM-AUTH-EMAIL
  export async function sendAuthEmail(input: {
    kind: "invite" | "verify-email" | "password-reset" | "role-changed" | "2fa-enabled";
    to: string;
    name?: string;
    link?: string;
    meta?: Record<string, string>;
  }): Promise<void>;
  ```

  The stand-in writes a clear block to the server console containing the link, in development and mock mode only. It never logs links in production. Wiring it to Phase 6 is a merge step.

---

## Step 3: The server auth API (the one thing every later phase uses)

Create **`src/platform/auth/index.ts`**, marked `server-only`, exporting exactly this:

```ts
export type CurrentUser = {
  id: string; name: string; email: string; image: string | null;
  role: Role;                          // ADMIN | MANAGER | SERVICE_LEAD | MEMBER
  serviceLines: ServiceLine[];         // from TeamProfile
  canApprove: boolean;                 // from TeamProfile
  timezone: string;
  twoFactorEnabled: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null>;
export async function requireUser(): Promise<CurrentUser>;                  // redirects to /login in RSC, throws AppError(401) in actions/routes
export async function requireRole(...roles: Role[]): Promise<CurrentUser>;
export function can(user: CurrentUser, action: PermissionAction, resource?: PermissionResource): boolean;
export function assertCan(user: CurrentUser, action: PermissionAction, resource?: PermissionResource): void; // throws AppError(403)
export async function requirePermission(action: PermissionAction, resource?: PermissionResource): Promise<CurrentUser>;
export function actorOf(user: CurrentUser): Actor;                           // for audit logs and events
```

- `PermissionAction`, `PermissionResource` and `Actor` come from `@/contracts`.
- `getCurrentUser` is cached per request with React `cache()`.
- Document each function in `src/platform/auth/README.md` with one example. This README is what Phases 5–18 will read.

---

## Step 4: The permission map

1. **`src/platform/auth/permissions.ts`** implements `can()` from the permissions contract:
   - **Actions:** every core action in the project-rules matrix, plus every action the module registry reports through `getAllPermissions()`. An action that isn't registered is always denied, and in development it logs a warning naming the action.
   - **Role rules,** exactly as the matrix in project-rules:
     - **`ADMIN`:** allowed everything.
     - **`MANAGER`:** allowed all operational actions across every service line, but not credentials, role changes or prompt-version publishing (as the matrix says).
     - **`SERVICE_LEAD`:** allowed operational actions only when `resource.serviceLine` is in their `serviceLines`. Read-only elsewhere, where the matrix allows reading.
     - **`MEMBER`:** allowed actions on resources where `resource.ownerId === user.id`, within their service lines. Approving outreach needs `canApprove`.
   - **Resource scoping:** `PermissionResource` may carry `serviceLine`, `ownerId`, `market` and `module`. A missing scope field on an action that requires it means deny, never allow.
   - **The matrix is data,** a typed table, not scattered `if` statements. saas-auth forbids role string comparisons across the codebase.
2. **Tests.** A generated test walks **every action × every role × each scope case** and compares the result with the project-rules matrix. The expected values live in a test fixture copied from the matrix, so any drift fails the test.
3. **Route protection:**
   - The middleware/proxy redirects unauthenticated requests on `(platform)` routes to `/login?next=…`.
   - It lets `/login`, `/invite/*`, `/reset/*`, `/api/auth/*`, `/api/health` and `/api/cron/*` through. Cron is protected by its own secret in Phase 6.
   - Middleware is **not** the security control. Every server action and route handler still calls `requireUser` or `requirePermission`, per saas-auth.

---

## Step 5: Team profiles and user administration services

Build these services with Zod-validated server actions, using the saas-api handler shape. **No screens.** Phase 18 builds the screens.

- **`src/platform/team/`:**
  - `getTeamProfile(userId)`
  - `listTeam({ serviceLine?, role? })`
  - `updateTeamProfile(actor, userId, { serviceLines?, weeklyCapacity?, timezone?, canApprove? })`
  - `recalculateLoad(userId)`: sums active assignments. Until acquisition exists, this reads a `currentLoad` field. Later phases call it.
  - `getLineCapacity(serviceLine)`: the total capacity and load of the owners of a line. Phase 11 uses it for capacity throttling.
  - `isLineAtCapacity(serviceLine)`
- **`src/platform/auth/users.ts`:**
  - `listUsers`
  - `changeRole` (rotates the target's sessions and sends a role-changed email)
  - `deactivateUser` (revokes all sessions; the user can no longer sign in; the record stays)
  - `reactivateUser`
  - `resetUser2FA` (admin only)
  - `forceSignOut`
- Every mutation:
  - checks permission with `assertCan`
  - writes an audit entry through `SEAM-AUDIT`
  - refuses to leave the platform with **zero active admins**
- **`SEAM-AUDIT` stand-in** (fixed signature, shared with Phases 5 and 6):

  ```ts
  // src/platform/auth/_seams.ts
  // SEAM:SEAM-AUDIT
  export async function recordAudit(tx: Tx | null, entry: {
    actor: Actor; action: string; targetType: string; targetId: string;
    before?: unknown; after?: unknown; ip?: string; userAgent?: string;
  }): Promise<void>;
  ```

  The stand-in writes directly to the `AuditLog` table.

---

## Step 6: Auth pages (`src/app/(auth)/`)

These pages must look finished and on-brand, even though Phase 4's component library isn't available yet.

- **Pages:**
  - `/login`
  - `/login/2fa`
  - `/invite/[token]` (accept: set name and password)
  - `/reset` (request) and `/reset/[token]` (set a new password)
  - `/setup-2fa` (QR code, verify, backup codes)
  - `/signed-out`
- **Styling:**
  - Use the semantic tokens and fonts from `src/styles/` only. No raw colours, which lint enforces.
  - Keep any small local primitives (input, button, field error) in `src/app/(auth)/_components/`.
- **Layout.** Follow the saas-ui philosophy: no card-in-a-box login.
  - A split layout: a deep-navy brand panel with the FUTUREUNI logo and one confident line of display type, and a clean lavender form area.
  - It collapses to a single column at 375px.
- **Forms:**
  - React Hook Form with Zod
  - 48px fields
  - inline errors
  - a visible focus ring
  - a pending state on submit
  - `autocomplete` attributes set correctly
  - the password manager works
- The `next` parameter is honoured after sign-in, but only for same-origin paths, to prevent open redirects.
- Accessibility: labels, `aria-live` for form errors, keyboard-only flow works.

---

## Step 7: Seed credentials

Create **`src/platform/auth/seed.ts`**, which the Phase 2 seed runner discovers automatically:

- gives every seeded user a password credential; the development password comes from `.env.local` (`SEED_USER_PASSWORD`), with a documented default for local use only
- marks the seeded admin as needing 2FA setup, unless `SEED_SKIP_2FA=true`
- creates two pending invites and one expired invite
- is idempotent and refuses to run in production

---

## Step 8: Tests

Follow the saas-testing priority: permissions first.

- **Unit tests:**
  - the full permission matrix test (Step 4)
  - invite token rules: expiry, single use, hashed storage, role ceiling
  - the last-admin protection
  - the open-redirect guard on `next`
- **Integration tests** against the phase test database:
  - accepting an invite creates the user, team profile and audit entry in one transaction, and rolls back entirely on failure
  - `changeRole` rotates the target's sessions
  - `deactivateUser` blocks sign-in
  - rate limiting kicks in after N failed sign-ins
- **Playwright,** in `tests/e2e/phase-03/`, on desktop and mobile:
  - sign in as the seeded manager
  - a wrong password shows a generic error
  - accept a pending invite using the link printed by the email stand-in (read it from the server log or a test hook), then land signed in
  - the admin is forced into 2FA setup
  - password reset end to end
  - visiting a platform route while signed out redirects to `/login?next=…` and returns there after signing in

---

## Constraints

- **Don't import Phase 4, 5 or 6 code.** Use the seams.
- **No schema edits:** raise requests.
- **No admin or team screens:** services only; Phase 18 builds the UI.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] Invite-only sign-in works with email and password. Google sign-in is built but disabled by default.
- [ ] 2FA with TOTP works, is enforced for admins, and backup codes work.
- [ ] `@/platform/auth` exports exactly the API in Step 3, documented in its README.
- [ ] `can()` implements the full matrix; the generated matrix test passes for every action × role × scope.
- [ ] Middleware protects `(platform)` routes, and every service checks permissions on the server.
- [ ] Team and user services exist and are tested, including capacity helpers and last-admin protection.
- [ ] Auth pages are on-brand, accessible and responsive at 375px.
- [ ] The seed gives every user working credentials, idempotently.
- [ ] Every seam has a stand-in with the fixed signature and a `// SEAM:` marker. `phases/03/REQUESTS.md` lists each seam's wiring change, any schema requests, and the request to let Phase 18 restyle `(auth)` with shared components.
- [ ] `pnpm check` and `pnpm test:e2e` pass.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/03/SUMMARY.md` is written.
