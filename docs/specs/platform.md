# FUTUREUNI Internal Platform: platform spec

| | |
|---|---|
| Status | Agreed (Phase 0 baseline) |
| Owner | Phase 0 (lead architect). Business owner: Prince Amadin, FUTUREUNI |
| Last updated | 2026-09-25 |
| Source brief | `docs/prompts/phase-00-requirements.md` Step 3a; `docs/background/FutureUni-Growth-Engine-Pipeline.pdf` |

**Read with:** `.claude/project-rules.md` (rules: brand, roles and the permission matrix, domain invariants `INV-n`, bans, output rules), `docs/specs/module-acquisition.md` (the first module), `docs/specs/data-model.md` (field-level data model), `docs/contracts/*.md` (interfaces), `docs/decisions.md` (ADRs), `docs/integrations.md` (external services). This spec describes *what* the platform core does. It never restates a rule: it links to project-rules, the contracts, or an ADR.

## Changelog

| Date | Change |
|---|---|
| 2026-09-25 | First version (Phase 0) |

---

## 1. Problem and goal

**Problem.** FUTUREUNI (web development, UI/UX design, graphic design and video editing) runs its growth work on scattered spreadsheets, personal inboxes and memory. Every internal tool it has planned (client acquisition, a content engine for marketing and social output, HR screening, admin reporting, proposal drafting — see `docs/background/`) would otherwise become its own app with its own login, database, host and bill, and none of them would share the company and contact data they all need.

**Goal.** One internal web application, on one host (Vercel Pro, ADR-003), with one login, one database and one design system, that holds every internal tool as a **module**. The platform core provides identity, permissions, the shared company and contact directory, the app shell, notifications, audit, settings, credentials, AI, background jobs and file storage once; modules add features without changing the core (ADR-002).

**Success measures.**
- A new module (for example Marketing) goes from `pnpm create-module` to a navigable, permission-gated page in the shell in under one working day, with zero edits under `src/platform/` (`docs/prompts/wave-5/adding-a-new-module.md`).
- Every staff member signs in once and reaches their own work (queue, inbox, pipeline, alerts) from the platform home in one click.
- Every sensitive action (role change, credential save, prompt publish, settings change) is traceable in the audit log with actor, time and before/after.
- The whole platform builds, tests and runs end to end with `MOCKS=true` and no external keys (ADR-005).

---

## 2. Users and roles

The platform is **single-tenant** (FUTUREUNI only). There is no organisation boundary; the boundary that matters is **role + service lines + ownership**. The authoritative action × role matrix, the scope codes (`ALL`, `LINES`, `OWN`, `OWN+A`, `SELF`, `CEIL`) and the not-yours behaviour live in `.claude/project-rules.md` §"Roles and permissions". The contract for `can()` is `docs/contracts/permissions.md`.

| Role | Who they are | Can see (platform core) | Can do (platform core) | Cannot |
|---|---|---|---|---|
| `ADMIN` | Founders, the operations lead, the lead engineer | Everything: all modules, users, team, settings, integrations and credentials (masked), prompt versions, AI usage and cost, jobs, audit log, `/dev/ui` in production | Everything, including inviting any role, changing roles, deactivating users, resetting 2FA, saving/testing/deleting credentials, publishing and activating prompt versions (including forced publish), editing budgets and model tiers, toggling modules and schedules, running jobs now | Leave the platform with zero active admins; skip 2FA |
| `MANAGER` | Heads of growth and sales, delivery managers | All modules, all service lines, all analytics; the Admin area (`platform.admin.access`) limited to users (read, invite), team capacity, job runs, mailboxes (read), suppression, platform settings (read-only) | All operational work across every line; invite users at `MANAGER` or below; edit team profiles of `SERVICE_LEAD` and `MEMBER` users (capacity, lines, timezone, `canApprove`); retry and cancel jobs | Credentials, role changes, deactivation, prompt publishing, budgets, platform settings changes, module toggles, audit log |
| `SERVICE_LEAD` | The owner of one or more service lines (for example the head of video editing) | Their lines fully; every acquisition service-line tab, read-only outside their lines where the matrix says `ALL`; their lines' team members | Full operational rights inside their lines (search, review, approve, inbox, pipeline, proposals, line settings, profile publishing); add suppressions from a lead's detail | Anything outside their lines except reading; the Admin area (`/admin` requires `platform.admin.access`, `ADMIN` and `MANAGER` only) |
| `MEMBER` | Sales and delivery staff working assigned leads | Their lines' leads and analytics; their own threads and queue items | Work leads assigned to them (`OWN`); draft outreach; approve only when `TeamProfile.canApprove` is true (`OWN+A`) | Approve without `canApprove`; run searches; any admin area; other lines |

- **Tenant boundary:** single-tenant. Records are scoped by service line (`LINES`) and ownership (`OWN`) as the matrix says. Scope values always come from the session and the stored record, never from the request (`.claude/project-rules.md`, saas-auth).
- **Not yours:** reading a record outside your scope returns *not found* (404); calling a mutation you are not allowed returns `FORBIDDEN` (403) with nothing changed. See project-rules for the exact rule.
- **Device split:** staff use laptops at work; every screen also works down to 375px wide (project-rules §"Brand and UI").

### 2.1 Team profile

Every user has exactly one `TeamProfile` (`docs/specs/data-model.md`, TeamProfile), created when their invite is accepted:

| Field | Meaning | Who edits |
|---|---|---|
| Service lines | One or more of `WEB_DEVELOPMENT`, `UI_UX_DESIGN`, `GRAPHIC_DESIGN`, `VIDEO_EDITING` (ADR-008). Defines `LINES` scope. | `ADMIN`; `MANAGER` for `SERVICE_LEAD`/`MEMBER` |
| Weekly capacity | How many active client projects the person can carry (default 3) | `ADMIN`, `MANAGER` |
| Current load | Active delivery assignments (active `HandoffAssignment` rows once acquisition exists; before that the stored `currentLoad`), recalculated by `recalculateLoad(userId)` | System |
| Timezone | IANA zone (default `Africa/Lagos`), used for display, SLAs and working hours | The user, `ADMIN`, `MANAGER` |
| Working hours | `workingDays` (ISO weekdays, default Mon–Fri), `workingHoursStart` / `workingHoursEnd` (default 09:00–17:00), used for reply SLAs in business hours | The user, `ADMIN`, `MANAGER` |
| `canApprove` | Lets a `MEMBER` approve outreach for their own leads (`OWN+A`) | `ADMIN`, `MANAGER` |
| Booking URL | The person's own booking link (user setting `acquisition.bookingUrl`, falling back to `acquisition.defaultBookingUrl`) | The user, `ADMIN` |
| Title | Job title used in email signatures | The user, `ADMIN` |

**Capacity drives acquisition throttling:** a line's capacity is the sum of the weekly capacity of its owners and its load is the sum of their current load (`getLineCapacity(serviceLine)`, `isLineAtCapacity(serviceLine)`). The throttle rules are in `docs/specs/module-acquisition.md` §3.10.

---

## 3. Core capabilities and the module system

Each capability names the phase that builds it and the contract it implements. Folder ownership is in `CLAUDE.md`.

### 3.1 Authentication and invites (Phase 3, ADR-013)
- Sign-in by email and password through Better Auth. Optional Google sign-in restricted to `auth.googleAllowedDomains`, built but off by default (`AUTH_GOOGLE_ENABLED=false`).
- **No public signup.** Accounts exist only by accepting an invite. Invites are single-use, hashed, expire after `auth.inviteExpiryDays` (7), bound to the invited email, and carry a role and service lines.
- Sessions: secure httpOnly `SameSite=Lax` cookies, `auth.sessionDays` (30) with sliding renewal, rotated on sign-in and on any role or permission change; "sign out of all devices".
- Passwords: at least 12 characters, strength meter, checked against a common-password list; hashing per the library.
- 2FA (TOTP) for everyone; **required for `ADMIN`** (forced setup after sign-in); backup codes shown once.
- Rate limits on sign-in, reset, invite acceptance and 2FA verification; non-enumerating messages ("If that account exists, we've sent a link.").
- The `next` redirect honours same-origin relative paths only.

### 3.2 Users, roles and the permission map (Phase 3)
- `@/platform/auth` exports `getCurrentUser`, `requireUser`, `requireRole`, `can`, `assertCan`, `requirePermission`, `actorOf`, and `assertActorCan(actor, action, resource?)` for code that holds an `Actor` rather than a session (jobs, the SEAM-PERMISSION stand-ins in Phases 5 and 6) (`docs/contracts/permissions.md`).
- The `/admin` frame and the core manifest's Admin navigation require `platform.admin.access` (`ADMIN`, `MANAGER`); each admin section is also gated by its own action.
- The matrix in project-rules is implemented once as data. Modules register their actions through their manifest; an unregistered action is always denied.
- Middleware/proxy only redirects signed-out visitors; every server action and route handler checks permission itself.
- User administration services: `listUsers`, `changeRole`, `deactivateUser`, `reactivateUser`, `resetUser2FA`, `forceSignOut`. Every mutation audits and refuses to leave zero active admins.

### 3.3 Shared companies and contacts directory (Phase 2)
- `Company` and `Contact` are **platform** records used by every module and never duplicated per module (`docs/specs/data-model.md`).
- All matching and upserts go through `@/platform/directory`: `normalizeDomain`, `normalizePhone`, `normalizeEmail`, `normalizeCompanyName`, `findMatchingCompany` (dedupe order: normalised domain → normalised phone → normalised name + city), `upsertCompany`, `upsertContact`. Upserts merge non-empty fields without overwriting verified data and record source, collection time and lawful basis (INV-10).
- Soft delete applies to `Company` and `Contact` only (project-rules §"Domain invariants").

### 3.4 App shell and navigation from module manifests (Phase 4 UI, Phase 2 registry)
- The shell (sidebar with module switcher, top bar with breadcrumbs, command palette trigger, notification bell and user menu; mobile bottom navigation with at most 5 items) is built from `getEnabledModules()` and `getNavigation(user)`.
- Navigation entries the user can't use are hidden; permission checks are computed on the server and passed to client components as plain data.
- Visual direction, tokens and typefaces: project-rules §"Brand and UI", ADR-011, ADR-014 and the Phase 4 visual-direction ADR.

### 3.5 Command palette (Phase 4)
- Opens with Cmd/Ctrl+K and from a visible trigger. Groups: Navigate (from `getNavigation`), Actions (modules call `registerCommand({ id, label, group, shortcut, perform, permission })`), Recent, Theme. Fully keyboard-driven, fuzzy search.
- A "?" overlay lists the shortcuts available on the current screen (`useShortcut`).

### 3.6 In-app notifications (Phase 6, saas-notify)
- One entry point, `notify({ userIds | role | serviceLine, type, title, body?, link?, data?, channels?, dedupeKey? })`, fans out to in-app and email by user preference and the type's defaults.
- A notification-type registry: platform types are seeded by Phase 6; modules add theirs through their manifest. `critical` types can't be muted. The full list of type ids is in `docs/contracts/events.md` (notification types).
- Services: `listForUser`, `unreadCount`, `markRead`, `getPreferences`, `updatePreferences`; the bell refreshes through `GET /api/notifications/stream` (polling or server-sent events).
- Platform (transactional) email goes through Resend + React Email (ADR-023), asynchronously through the `platform.send-email` job, with a plain-text version for every template and a dev-only preview route. It is separate from cold-outreach sending (ADR-016).

### 3.7 Audit log (Phase 6)
- `audit.record(tx | null, entry)` records actor, `action` (`module.resource.verb`), target type and ID, before/after (sensitive keys redacted), IP and user agent. `withAudit(tx, entry, fn)` runs a mutation and its audit entry in one transaction.
- Append-only (INV-20). Queries: `listAudit`, `getAuditForTarget`; CSV export for a date range.

### 3.8 Settings (Phase 6)
- Typed settings registry: each key has a Zod schema, default, scope (`PLATFORM`, `MODULE`, `USER`), label, description and the permission needed to edit it. Secrets never go in settings.
- `getSetting(key, { userId? })`, `setSetting(actor, key, value)` (validates, checks permission, audits, emits `settings.changed`), `listSettings({ scope, module? })`.
- Platform keys: `platform.timezone`, `platform.companyName`, `platform.postalAddress`, `platform.crawlerContactUrl`, `platform.retention.*`, `module.<id>.enabled`, `jobs.<name>.enabled`, `notifications.digest.enabled`, `user.theme`, `user.density`, `user.reducedMotion`, `auth.googleAllowedDomains`, `auth.inviteExpiryDays`, `auth.sessionDays`, `ai.modelTiers`, `ai.budgets`, `ai.logContentOverrides`. Acquisition keys are listed in `docs/specs/module-acquisition.md` §3.16.

### 3.9 Encrypted integration credentials (Phase 6)
- AES-256-GCM with `CREDENTIALS_ENCRYPTION_KEY`, random IV per record, auth tag and key version stored alongside (INV-21).
- Services: `saveCredential` (`ADMIN`), `getCredential` (server-only, decrypted, for adapters), `getCredentialStatus` (masked, for example `sk-…a91f`, plus status, last tested, last error), `testCredential`, `deleteCredential`, `rotateEncryptionKey` (`pnpm credentials:rotate`), `resolveProviderKey(provider)` (stored credential → env variable → nothing in mock mode).
- A provider registry covers every service in `docs/integrations.md`; each provider has a payload schema and a cheap read-only `test()`.

### 3.10 AI service with usage and cost logging (Phase 5, ADR-006, ADR-018, ADR-028)
- `runTask`, `streamTask`, `runBatch`, `registerTask`, `getTask` (`docs/contracts/ai-service.md`). Tasks run from versioned runtime skills (`runtime-skills/`, ADR-007) with Zod-validated output and one repair attempt.
- Every call writes an `AiCall` row (INV-13) with tokens and `costMicros` (ADR-027). Prompt and response text are not stored unless a task's log-content setting says so.
- Quotas and budgets from `ai.budgets`: platform daily and monthly USD, per-module daily USD, per-user daily calls, per-task max tokens. At 80% a `ai.budget.warning` event; at 100% calls fail with `AI_QUOTA_EXCEEDED` and `ai.budget.exceeded` is emitted.
- Prompt versions: `publishPromptVersion` (eval-gated), `listPromptVersions`, `activatePromptVersion` (rollback), `diffPromptVersions`. The eval harness runs with `pnpm evals` in mock mode (CI) or `--live` with a spend cap.

### 3.11 Background jobs, schedules and the job-run log (Phase 6, ADR-003)
- Jobs run on Vercel Workflow (durable steps: a failure in step 3 retries from step 3). `enqueueJob(name, input, { actor, idempotencyKey?, runAt? })` creates exactly one `JobRun` per idempotency key (INV-22). Control: `cancelJob`, `retryJob`, `listJobRuns`, `getJobRun`; local trigger `pnpm jobs:run <name> '<json>'`; an inline runner for tests (`docs/contracts/jobs.md`).
- **One Vercel Cron entry** calls `GET /api/cron/tick` every 5 minutes (ADR-033); the dispatcher computes which manifest schedules and dynamic schedules (for example saved searches) are due in their own timezone (default `Africa/Lagos`) and enqueues each with the key `"<job>:<slot-iso>"`. Any schedule can be switched off with `jobs.<name>.enabled`.
- Platform jobs: `platform.send-email`, `platform.deliver-event`, `platform.notifications-digest`, `platform.job-runs-cleanup`, `platform.retention-purge`, `platform.credentials-health`. `platform.retention-purge` purges **platform-owned** data only (AI call content, job runs, expired files, and the audit log if `platform.retention.auditLogMonths` is set); a module purges its own data with its own job (for acquisition, `acquisition.compliance.retention-purge`), because platform code never imports modules.

### 3.12 File storage (Phase 6)
- `StorageAdapter` with `vercel-blob` and `local` (`.storage/`, gitignored; a file lives at `.storage/<key>`, the key's `/` segments becoming folders, and the development seed writes under `seed/…`) implementations. `putFile`, `getSignedUrl`, `deleteFile`, `createUploadUrl` (direct browser uploads, saas-api upload rules).
- Every file has a `FileObject` row with its purpose (`FilePurpose`), access (`PRIVATE` by default), size, type and uploader. Type and size are validated on the server from content, never from the extension.

### 3.13 Domain events (Phase 6)
- `publish(event)` and `publishAfterCommit(tx, event)`: a rolled-back transaction never emits. Subscribers run `inline` (errors logged, never break the publisher) or as a `job` (`platform.deliver-event`). The event catalogue is `docs/contracts/events.md`.
- Platform subscribers: `notification-router` (events → notifications) and `audit-bridge`.

### 3.14 The module system (Phase 2 registry, `docs/contracts/module-manifest.md`)
- A module lives in `src/modules/<module-id>/` and declares itself with a `manifest.ts`: `id`, `name`, `icon` (a Lucide icon name), `routePrefix`, the navigation tree, the permission actions it adds, jobs, cron schedules, an optional dynamic-schedules provider, settings panels, home widgets, notification types, and an `enabled` flag.
- **Discovery by code generation:** `pnpm registry:gen` finds every `src/modules/*/manifest.ts` and writes `src/platform/registry/generated.ts` (committed; CI fails if stale). Generation fails on duplicate module IDs, overlapping route prefixes, duplicate actions or job names, invalid cron expressions, and navigation outside the route prefix.
- **Enable/disable:** a module is enabled when its manifest's `enabled` is true, unless the platform setting `module.<id>.enabled` overrides it. A disabled module disappears from navigation, the command palette and the home, its routes return not found, and its schedules stop.
- **Module ids:** 2–32 lower-case letters (for example `marketing`), never `platform` or a reserved route segment (`home`, `settings`, `admin`, `dev`, `login`, `invite`, `reset`, `setup-2fa`, `signed-out`, `u`, `api`). The id is the first segment of the module's permissions, jobs, AI tasks and events.
- **Creating a module:** `pnpm create-module <id> "<Name>"` copies `templates/create-module/` into `src/modules/<id>/` and `src/app/(platform)/<id>/`, replaces the tokens, runs `registry:gen` and prints the next steps (write `docs/specs/module-<id>.md`, add an ownership entry, add `prisma/schema/<id>.prisma` with a `<id>_` table prefix). Modules never import each other; they share data through the directory and events.

### 3.15 Platform home
The first screen after sign-in (`/`), showing the user's own work across modules:
- a greeting in display type with the user's name and today's date in their timezone;
- **"Needs you"** counts that link through: review queue items waiting for the user, unread actionable replies, meetings today, overdue next actions and nurture follow-ups due;
- **module widgets** from `getHomeWidgets()` (for acquisition: "My review queue", "My inbox", "Pipeline value");
- **alerts**: failing integrations, paused mailboxes, AI budget warnings (only for roles that can act on them);
- **recent activity**: audit and lead events where the user is the actor or owns the record.
Navigation badges and the home must show the same counts (Phase 19).

---

## 4. User stories and acceptance criteria

IDs are stable. Role-restricted stories carry a negative criterion. Scope rules come from the matrix in project-rules.

### US-1: Sign in
As any staff member, I want to sign in with my email and password so that I reach my work.
- **AC-1.1** Given an active user with a password, when they submit correct credentials on `/login`, then they land on `/` (or on the same-origin `next` path) with a session cookie that is `HttpOnly`, `Secure` and `SameSite=Lax`.
- **AC-1.2** Given a wrong password or an unknown email, when they submit, then the page shows the same generic error for both and no session is created.
- **AC-1.3** Given 5 failed sign-ins for one account within 15 minutes, when a 6th is attempted, then it is refused with `RATE_LIMITED` and a retry time.
- **AC-1.4 (negative)** Given a deactivated user, when they submit correct credentials, then sign-in is refused with the generic error.
- **AC-1.5** Given `next=https://evil.example`, when sign-in succeeds, then the user lands on `/`, not the external URL.

### US-2: Invite a teammate
As an `ADMIN` or `MANAGER`, I want to invite a teammate with a role and service lines so that they can join without public signup.
- **AC-2.1** Given an `ADMIN`, when they invite `ada@futureuni.example` as `SERVICE_LEAD` for `VIDEO_EDITING`, then a pending invite exists, expiring in `auth.inviteExpiryDays` days, and one invite email is sent (mock: logged).
- **AC-2.2 (negative)** Given a `MANAGER`, when they invite someone as `ADMIN`, then the call fails with `FORBIDDEN` and no invite exists.
- **AC-2.3 (negative)** Given a `SERVICE_LEAD` or `MEMBER`, when they call `createInvite`, then it fails with `FORBIDDEN`.
- **AC-2.4** Given an email that belongs to an active user, when an admin invites it, then the call fails with a `CONFLICT` whose message does not reveal account details.
- **AC-2.5** Given a pending invite, when an admin revokes it, then its link stops working and an audit entry with action `platform.user.invite` and target type `Invite` is written.

### US-3: Accept an invite
As an invited person, I want to set my name and password from the invite link so that my account is created with the right access.
- **AC-3.1** Given a valid invite, when the person submits a name and a 12+ character password on `/invite/[token]`, then in one transaction a `User` with the invited role, a `TeamProfile` with the invited service lines and default capacity, and an audit entry are created, and the invite is marked used.
- **AC-3.2 (negative)** Given an invite created 7 days and 1 minute ago, when the link is opened, then the page says the invite has expired and nothing is created.
- **AC-3.3 (negative)** Given an invite that was already used, when the link is opened again, then it is refused and no second user is created.
- **AC-3.4** Given a failure while creating the team profile, when acceptance runs, then no user exists and the invite is still pending (full rollback).

### US-4: Reset a password
As a staff member, I want to reset a forgotten password so that I can get back in.
- **AC-4.1** Given any email, when it is submitted on `/reset`, then the page always says "If that account exists, we've sent a link."
- **AC-4.2** Given a valid reset link used within its lifetime, when a new password is set, then all of that user's sessions are revoked and they can sign in with the new password.
- **AC-4.3 (negative)** Given a reset link that was already used, when it is opened, then it is refused.

### US-5: Two-factor authentication
As an `ADMIN`, I must use 2FA so that the most powerful accounts are protected.
- **AC-5.1** Given an `ADMIN` without 2FA, when they sign in, then they are sent to `/setup-2fa` and cannot reach any other platform route until 2FA is verified.
- **AC-5.2** Given any user with 2FA, when they sign in with a correct password, then they must enter a valid TOTP code or an unused backup code on `/login/2fa` before a session is issued.
- **AC-5.3** Given backup codes generated at setup, when a code is used once, then the same code is refused a second time.
- **AC-5.4 (negative)** Given an `ADMIN`, when they try to disable their own 2FA in `/settings`, then it is refused.

### US-6: Administer users
As an `ADMIN`, I want to change roles, deactivate and reactivate users, reset 2FA and force sign-out so that access stays correct.
- **AC-6.1** Given an `ADMIN`, when they change a user's role from `MEMBER` to `SERVICE_LEAD`, then the target's sessions rotate, a "role changed" email is sent, `user.roleChanged` is emitted and an audit entry with before/after is written.
- **AC-6.2** Given exactly one active `ADMIN`, when anyone tries to deactivate them or change their role, then the call fails with `CONFLICT` ("The platform must keep at least one active admin") and nothing changes.
- **AC-6.3** Given a deactivated user, when an admin reactivates them, then they can sign in again with their existing password.
- **AC-6.4 (negative)** Given a `MANAGER`, when they call `changeRole`, `deactivateUser`, `resetUser2FA` or `forceSignOut`, then each fails with `FORBIDDEN`.

### US-7: Manage team capacity
As a `MANAGER`, I want to set each person's service lines, weekly capacity and approval flag so that throttling and routing reflect reality.
- **AC-7.1** Given a `MANAGER`, when they set a `MEMBER`'s weekly capacity to 5, then `getLineCapacity` for that member's lines reflects the new total on the next call and an audit entry is written.
- **AC-7.2** Given two owners of `GRAPHIC_DESIGN` with capacity 3 and load 3 each, when `isLineAtCapacity(GRAPHIC_DESIGN)` is called, then it returns true.
- **AC-7.3 (negative)** Given a `MANAGER`, when they edit an `ADMIN`'s or another `MANAGER`'s team profile access fields, then it fails with `FORBIDDEN`.
- **AC-7.4 (negative)** Given a `SERVICE_LEAD`, when they call `updateTeamProfile`, then it fails with `FORBIDDEN`.

### US-8: Navigation built from module manifests
As any user, I want the shell to show only the modules and sections I can use so that I'm never sent to a dead end.
- **AC-8.1** Given the acquisition module enabled and a `SERVICE_LEAD` for `VIDEO_EDITING`, when they open the shell, then the sidebar shows Client Acquisition with every service-line tab; in Web Development, action controls (Run search, Approve and the like) are absent and the matching server actions return `FORBIDDEN`. Given a `MEMBER` of `VIDEO_EDITING`, then only the Video Editing tab (and Overview filtered to their lines) is shown.
- **AC-8.2** Given `module.acquisition.enabled=false`, when any user opens the shell, then Client Acquisition is absent from the sidebar and command palette and `/acquisition` returns not found.
- **AC-8.3 (negative)** Given a `MEMBER`, when they open the shell, then no Admin entry is shown and `/admin` renders the no-permission state.
- **AC-8.5 (negative)** Given a `SERVICE_LEAD`, when they open the shell, then no Admin entry is shown and `/admin` (including `/admin/suppression`) renders the no-permission state (`platform.admin.access`).
- **AC-8.4** Given a viewport 375px wide, when any platform page opens, then there is no horizontal overflow and the bottom navigation shows at most 5 items.

### US-9: Command palette
As any user, I want a keyboard command palette so that I can jump anywhere or run common actions quickly.
- **AC-9.1** Given any platform page, when the user presses Ctrl+K (Cmd+K on macOS), then the palette opens with focus in the search field.
- **AC-9.2** Given the user types "video review", when they press Enter on the first match, then they navigate to `/acquisition/video-editing/review` if they have access.
- **AC-9.3 (negative)** Given a command registered with a permission the user lacks, when they search for it, then it does not appear.

### US-10: Platform home
As any user, I want a home page that shows my own work across modules so that I know what needs me.
- **AC-10.1** Given a `SERVICE_LEAD` with 4 review items waiting, 2 unread actionable replies and 1 meeting today, when they open `/`, then "Needs you" shows 4, 2 and 1, each linking to the matching screen.
- **AC-10.2** Given a new user with no assignments, when they open `/`, then the empty state explains where work will appear and links to their first service line.
- **AC-10.3** Given the widget data fails to load, when the home renders, then that widget shows an error with "Try again" and the rest of the page still renders.
- **AC-10.4** Given the same user, when the acquisition navigation badge and the home "My review queue" widget are both shown, then they display the same count.

### US-11: In-app notifications
As any user, I want notifications in the bell and by email according to my preferences so that I hear about what matters.
- **AC-11.1** Given a `reply.interested` notification for a user, when it is created, then the bell's unread count increases by 1 within one polling interval without a page reload.
- **AC-11.2** Given 3 unread notifications, when the user chooses "Mark all as read", then the unread count is 0 and each has `readAt` set.
- **AC-11.3 (negative)** Given a critical type (for example `security.role-changed`), when the user tries to switch it off in `/settings`, then the control is locked and the preference is not saved.
- **AC-11.4 (negative)** Given user A, when they call `markRead` with a notification ID that belongs to user B, then nothing changes for user B.
- **AC-11.5** Given two `notify` calls with the same `dedupeKey` for the same user within the dedupe window, then only one notification exists.

### US-12: Personal settings
As any user, I want to manage my profile, notifications, appearance and security so that the platform fits how I work.
- **AC-12.1** Given any user, when they change their timezone to `Europe/London`, then relative and absolute times across the platform render in that zone.
- **AC-12.2** Given any user, when they choose the dark theme and reload, then the page renders dark with no light flash.
- **AC-12.3** Given two active sessions, when the user signs out of the other session from the security section, then that session can no longer make requests.
- **AC-12.4 (negative)** Given user A, when they submit a settings update targeting user B's ID, then it fails with `FORBIDDEN` (the target always comes from the session).

### US-13: Shared company and contact directory
As any module, I want one shared directory with deduplication so that FUTUREUNI never holds two records for the same business.
- **AC-13.1** Given a company stored with domain `example.com.ng`, when a new candidate arrives with website `https://WWW.Example.com.ng/about`, then `findMatchingCompany` returns the existing company.
- **AC-13.2** Given a candidate whose website is an Instagram URL and whose phone is `0803 123 4567`, when a company exists with phone `+2348031234567`, then the match is by phone.
- **AC-13.3** Given a verified contact email, when an unverified source offers a different email for that contact, then the verified email is kept and the new one is not written over it.
- **AC-13.4** Given any upsert, when a contact is created, then its source, collection time and lawful basis (`LEGITIMATE_INTEREST_B2B` by default) are stored (INV-10).

### US-14: Audit log
As an `ADMIN`, I want an append-only audit log I can search and export so that every sensitive change is traceable.
- **AC-14.1** Given an admin saves a credential, when the audit log is filtered by action `platform.credential.manage`, then an entry exists with the actor and time and with no secret value in before or after.
- **AC-14.2** Given any entry, when anyone calls a service to update or delete audit entries, then no such service exists (append-only; INV-20).
- **AC-14.3 (negative)** Given a `MANAGER`, when they open `/admin/audit`, then they see the no-permission state and `listAudit` returns `FORBIDDEN`.
- **AC-14.4** Given an `ADMIN`, when they export a date range, then a CSV downloads with one row per entry and sensitive keys redacted.

### US-15: Platform settings
As an `ADMIN`, I want to set the postal address, timezone, retention periods and module switches so that the platform behaves correctly and lawfully.
- **AC-15.1** Given `platform.postalAddress` is empty, when any outreach email would be sent, then sending is blocked and `/admin/platform` shows a warning that outreach needs a postal address (INV-4).
- **AC-15.2** Given an `ADMIN`, when they change `platform.retention.personalDataMonths` from 12 to 18, then the change is validated, audited and `settings.changed` is emitted.
- **AC-15.3 (negative)** Given a `MANAGER`, when they call `setSetting` on a platform-scope key, then it fails with `FORBIDDEN`.
- **AC-15.4** Given a setting with no stored value, when `getSetting` is called, then its registered default is returned.

### US-16: Integration credentials
As an `ADMIN`, I want to store, test and replace API keys securely so that real providers can be switched on without editing code.
- **AC-16.1** Given an `ADMIN`, when they save a Google Places key, then the database row holds only ciphertext, IV, auth tag and key version, and `/admin/integrations` shows the value masked (`AIza…9fQc`).
- **AC-16.2** Given a stored credential and a matching env variable, when an adapter calls `resolveProviderKey`, then the stored credential wins.
- **AC-16.3** Given `MOCKS=true`, when an admin clicks "Test connection", then the test succeeds without network access and `lastTestedAt` is set.
- **AC-16.4 (negative)** Given a `MANAGER`, when they call `saveCredential`, `getCredentialStatus` or `deleteCredential`, then each fails with `FORBIDDEN`.
- **AC-16.5** Given a ciphertext modified by one byte, when it is decrypted, then decryption fails and the credential status becomes `FAILING`.

### US-17: AI usage, cost and budgets
As an `ADMIN`, I want to see AI spend and set budgets so that runaway cost is impossible.
- **AC-17.1** Given any AI task call, when it finishes with any outcome, then one `AiCall` row exists with task, prompt version, model, tokens, `costMicros`, latency and outcome (INV-13).
- **AC-17.2** Given the platform daily budget reached, when another task runs, then it fails fast with `AI_QUOTA_EXCEEDED`, is logged as `QUOTA_BLOCKED`, and admins receive `ai.budget-exceeded`.
- **AC-17.3** Given spend at 80% of the monthly budget, when the next call is logged, then admins receive one `ai.budget-warning` notification for that budget period.
- **AC-17.4 (negative)** Given a `MANAGER`, when they open `/admin/ai-usage` or call `getUsageSummary`, then access is refused.

### US-18: Prompt versions
As an `ADMIN`, I want to publish, compare and roll back prompt versions behind evals so that AI behaviour changes are deliberate.
- **AC-18.1** Given a task whose eval score drops by more than the tolerance, when an admin publishes without `force`, then publishing is refused and the eval report is shown.
- **AC-18.2** Given version 3 active, when an admin activates version 2, then new calls use version 2 and an audit entry records the rollback.
- **AC-18.3 (negative)** Given a `MANAGER`, when they call `publishPromptVersion`, then it fails with `FORBIDDEN`.

### US-19: Jobs and schedules
As a `MANAGER` or `ADMIN`, I want to see job runs and retry failures so that background work is visible and recoverable.
- **AC-19.1** Given `enqueueJob` called twice with the same idempotency key, then exactly one `JobRun` exists and the second call returns `deduplicated: true` (INV-22).
- **AC-19.2** Given a request to `/api/cron/tick` without the cron secret, then it is rejected with 401 and nothing is enqueued.
- **AC-19.3** Given the same 5-minute slot ticked twice, when the dispatcher runs, then each due job is enqueued once.
- **AC-19.4** Given a failed run, when a `MANAGER` retries it, then a new run linked to the old one starts; when a `SERVICE_LEAD` tries, it fails with `FORBIDDEN`.
- **AC-19.5** Given `jobs.platform.notifications-digest.enabled=false`, when its slot is due, then it is not enqueued.

### US-20: File storage
As any module, I want to store files privately with a record of each so that screenshots, proposals and CSVs are safe and traceable.
- **AC-20.1** Given an upload with a `.csv` extension whose content is an executable, when it is verified, then it is rejected with `UNSUPPORTED_MEDIA_TYPE` and no `FileObject` remains.
- **AC-20.2** Given a private file, when a signed URL is requested with a 5-minute TTL, then the URL works within 5 minutes and fails after.
- **AC-20.3** Given any stored file, then a `FileObject` row records purpose, access, size, type and uploader.

### US-21: Modules can be added, enabled and disabled
As an `ADMIN`, I want to turn modules on and off and let engineers add new ones without touching the core.
- **AC-21.1** Given `pnpm create-module sandbox "Sandbox"`, when `registry:gen`, `typecheck` and `build` run, then all pass and "Sandbox" appears in `getNavigation()` for an `ADMIN`.
- **AC-21.2** Given two manifests with the same route prefix, when `pnpm registry:gen` runs, then it fails with a message naming both modules.
- **AC-21.3 (negative)** Given a `MANAGER`, when they call the module toggle, then it fails with `FORBIDDEN`.

### US-22: Domain events
As a module engineer, I want to publish events after commit so that subscribers never react to rolled-back work.
- **AC-22.1** Given `publishAfterCommit` inside a transaction that rolls back, then no subscriber receives the event.
- **AC-22.2** Given two subscribers where one throws, when an event is published, then the other still receives it and the error is logged.

### US-23: UI gallery
As an engineer or designer, I want `/dev/ui` to show every component and pattern in both themes so that screens are assembled from a known kit.
- **AC-23.1** Given development mode, when anyone opens `/dev/ui`, then every component and pattern renders with realistic FUTUREUNI content in light and dark.
- **AC-23.2 (negative)** Given production, when a non-`ADMIN` opens `/dev/ui`, then it returns not found.

### US-24: Health check
As an operator, I want a health endpoint so that uptime monitoring can check the platform.
- **AC-24.1** Given a running app, when `GET /api/health` is called, then it returns 200 with `{ status, version, commit, mocks }` and no secrets.

---

## 5. Data model (platform core)

Field-level definitions, indexes, constraints and `onDelete` rules are in `docs/specs/data-model.md`. Auth library tables follow ADR-013.

| Id | Entity | Key fields (plain words) | Relations | Owned by | Notes |
|---|---|---|---|---|---|
| E-1 | User | name, email, role, status, 2FA flags, last active | has one TeamProfile; has many Sessions, Accounts, Notifications | The system (created by invite acceptance) | Deactivated, never hard-deleted |
| E-2 | Session, Account, Verification, TwoFactor, RateLimit | Better Auth's tables | belong to User (except RateLimit) | The auth library | Exact fields per library (ADR-013) |
| E-3 | Invite | email, role, service lines, hashed token, expiry, used/revoked | invited by User; accepted as User | The inviter | Single-use |
| E-4 | TeamProfile | service lines, weekly capacity, current load, timezone, working days and hours, canApprove, title | belongs to User | The platform (edited by ADMIN/MANAGER) | Drives LINES scope and throttling |
| E-5 | Company | name, normalised domain, website kind, phones, country, city, market, legal form, industry, size range, socials, first source, lawful basis | has many Contacts, CompanySourceRefs; referenced by module records | The platform directory | Soft-deleted |
| E-6 | CompanySourceRef | adapter, external ID (for example Google `place_id`) | belongs to Company | The platform directory | Unique per adapter + external ID |
| E-7 | Contact | name, role, email + status, phone, WhatsApp status, LinkedIn URL, source, collected at, lawful basis | belongs to Company | The platform directory | Soft-deleted; anonymised by DSR delete |
| E-8 | Note | author, module, target type and ID, body, mentions | written by User | Its author | Polymorphic target, no cross-module FK |
| E-9 | AuditLog | actor, action, target, before/after, IP, user agent | refers to actor User | The system | Append-only |
| E-10 | Notification | user, type, title, body, link, read at, dedupe key | belongs to User | Its recipient | |
| E-11 | NotificationPreference | user, type, channel, enabled | belongs to User | The user | Critical types ignore opt-out |
| E-12 | EmailDelivery | recipient, template, status, provider message ID, dedupe key | optional JobRun | The system | Platform email only |
| E-13 | Setting | key, scope, module, user, value | optional User | The platform (user scope: that user) | Never secrets |
| E-14 | IntegrationCredential | provider, ciphertext, IV, auth tag, key version, masked hint, status | created by User | The platform | Plaintext never stored |
| E-15 | AiCall | task, prompt version, model, tokens, costMicros, latency, outcome | optional JobRun | The system | No prompt text by default |
| E-16 | PromptVersion | task, version, content hash, compiled prompt, changelog, eval score, active | authored by User | The platform | One active per task |
| E-17 | JobRun | name, idempotency key, status, attempt, times, counts, error summary | optional parent JobRun | The system | Unique idempotency key |
| E-18 | DomainEvent | type, payload, occurred, dispatched | — | The system | After-commit outbox |
| E-19 | WebhookEvent | provider, event ID, status | — | The system | Webhook dedupe |
| E-20 | IdempotencyKey | scope, key, request hash, response | — | The system | Retried creates |
| E-21 | ProviderUsage | provider, day, calls, costMicros | — | The system | Daily caps for paid providers |
| E-22 | FileObject | key, purpose, access, type, size, uploader, retention | uploaded by User | The uploader's module | Soft-deleted |
| E-23 | SavedView | user, scope, name, query | belongs to User | That user | Saved filters |

**State machines (core).** `User.status`: `ACTIVE → DEACTIVATED → ACTIVE` (ADMIN only; never to zero active admins). `JobRun.status`: `QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED`; `QUEUED → CANCELLED`; a retry creates a new run. `IntegrationCredential.status`: `NOT_TESTED → OK | FAILING`, changing on every test. Invite: pending → used | revoked | expired (derived from timestamps).

---

## 6. Page and route map (core)

Acquisition routes are in `docs/specs/module-acquisition.md` §6. Roles follow the permission matrix; "Any" means any signed-in user.

| Id | Route | Purpose | Roles | Data needed | Stories |
|---|---|---|---|---|---|
| R-1 | `/login` | Sign in | Signed out | — | US-1 |
| R-2 | `/login/2fa` | Enter TOTP or backup code | Password-verified, 2FA pending | pending 2FA session | US-5 |
| R-3 | `/invite/[token]` | Accept invite: name and password | Holder of a valid invite | invite (email, role) | US-3 |
| R-4 | `/reset` | Request a reset link | Signed out | — | US-4 |
| R-5 | `/reset/[token]` | Set a new password | Holder of a valid reset token | token validity | US-4 |
| R-6 | `/setup-2fa` | QR code, verify, backup codes | Signed in without 2FA (forced for ADMIN) | TOTP secret | US-5 |
| R-7 | `/signed-out` | Confirmation after sign-out | Anyone | — | US-1 |
| R-8 | `/` | Platform home | Any | needs-you counts, widgets, alerts, activity | US-10 |
| R-9 | `/settings` (`?section=profile\|notifications\|appearance\|security`) | Personal settings | Any (SELF) | profile, preferences, sessions, 2FA | US-11, US-12 |
| R-10 | `/admin` | Admin home: integration health, paused mailboxes, AI spend vs budget, failed jobs (24h), pending invites, open data requests | ADMIN, MANAGER (`platform.admin.access`; each area also needs its own action) | status summaries | US-14–US-19 |
| R-11 | `/admin/users` | Users and invites | ADMIN (all actions), MANAGER (read, invite ≤ MANAGER) | users, invites | US-2, US-6 |
| R-12 | `/admin/team` | Team capacity and lines | ADMIN, MANAGER | team profiles, line capacity, throttle modes | US-7 |
| R-13 | `/admin/integrations` | Credentials and provider tests | ADMIN | provider registry, masked statuses | US-16 |
| R-14 | `/admin/mailboxes` | Mailboxes and sending domains | ADMIN (manage), MANAGER (read, DNS check) | mailboxes, domains, DNS results | module US-26 |
| R-15 | `/admin/suppression` | Suppression list | ADMIN (all), MANAGER (read, add, import); other roles add suppressions from the acquisition lead detail | suppressions | module US-9 |
| R-16 | `/admin/data-requests` | Data-subject requests | ADMIN | DSRs | module US-10 |
| R-17 | `/admin/prompts` | AI tasks and active versions | ADMIN | tasks, versions, eval scores | US-18 |
| R-18 | `/admin/prompts/[task]` | One task: versions, diff, eval reports, publish/activate | ADMIN | versions, reports | US-18 |
| R-19 | `/admin/ai-usage` | AI spend and budgets | ADMIN | usage summaries, budgets | US-17 |
| R-20 | `/admin/jobs` | Job runs and schedules | ADMIN, MANAGER | runs, schedules | US-19 |
| R-21 | `/admin/jobs/[runId]` | One run: steps, progress, error | ADMIN, MANAGER | run detail | US-19 |
| R-22 | `/admin/audit` | Audit log | ADMIN | audit entries | US-14 |
| R-23 | `/admin/platform` | Platform settings and modules | ADMIN (edit), MANAGER (read) | settings, modules | US-15, US-21 |
| R-24 | `/dev/ui/**` | Living UI gallery | Everyone in development; ADMIN in production | fixtures | US-23 |
| R-25 | `/u/[token]` | Public unsubscribe confirmation (module-owned, Phase 12) | Anyone with a signed token | token | module US-25 |

**API routes (core):** `/api/auth/[...all]` (Better Auth handler, public), `/api/health` (public), `/api/cron/tick` (cron secret), `/api/workflows/**` (Workflow framework), `/api/notifications/stream` (signed in), `/api/dev/emails/[template]` (development only). Module routes (`/api/unsubscribe/*`, `/api/webhooks/*`) are in the module spec.

**Public paths (no session; each protects itself):** `/login*`, `/invite/*`, `/reset*`, `/signed-out`, `/api/auth/*`, `/api/health`, `/api/cron/*` (secret), `/u/*`, `/api/unsubscribe/*` (signed token), `/api/webhooks/*` (signature). Everything else under `(platform)` redirects signed-out visitors to `/login?next=…`.

---

## 7. API surface (core)

Names and shapes only; the contracts hold the types. "Action" = Zod-validated server action (saas-api handler shape); "Service" = server-only function other code calls; "Route" = route handler. Roles = the permission action from the matrix.

| Id | Kind | Name / path | Input | Output | Permission | Stories |
|---|---|---|---|---|---|---|
| API-1 | Route | `/api/auth/[...all]` | library requests | library responses | public (rate limited) | US-1, US-4, US-5 |
| API-2 | Action | `createInvite` | email, role, serviceLines | invite summary | `platform.user.invite` | US-2 |
| API-3 | Action | `revokeInvite`, `resendInvite` | inviteId | invite summary | `platform.user.invite` | US-2 |
| API-4 | Action | `acceptInvite` | token, name, password | signed-in session | public (valid token) | US-3 |
| API-5 | Service | `getCurrentUser`, `requireUser`, `requireRole`, `requirePermission`, `can`, `assertCan`, `assertActorCan`, `actorOf` | — / action, resource | `CurrentUser` / boolean | — | US-8 |
| API-6 | Action | `listUsers` | filters, cursor | page of users | `platform.user.read` | US-6 |
| API-7 | Action | `changeRole` | userId, role | user | `platform.user.changeRole` | US-6 |
| API-8 | Action | `deactivateUser`, `reactivateUser` | userId | user | `platform.user.deactivate` | US-6 |
| API-9 | Action | `resetUser2FA`, `forceSignOut` | userId | — | `platform.user.reset2fa`, `platform.user.forceSignOut` | US-6 |
| API-10 | Service/Action | `getTeamProfile`, `listTeam({ serviceLine?, role? })` | ids, filters | team profiles | `platform.team.read` | US-7 |
| API-11 | Action | `updateTeamProfile` | userId, { serviceLines?, weeklyCapacity?, timezone?, workingDays?, workingHoursStart?, workingHoursEnd?, canApprove? } | team profile | `platform.team.update` | US-7 |
| API-12 | Service | `recalculateLoad(userId)`, `getLineCapacity(line)`, `isLineAtCapacity(line)` | ids | numbers / boolean | system | US-7 |
| API-13 | Service | `getAllModules`, `getEnabledModules`, `getNavigation(user, can)`, `getAllPermissions`, `getAllJobs`, `getCronSchedules`, `getSettingsPanels`, `getHomeWidgets` | — | registry data | system | US-8, US-21 |
| API-14 | Action | `setModuleEnabled` (via `setSetting("module.<id>.enabled")`) | moduleId, enabled | setting | `platform.module.toggle` | US-21 |
| API-15 | Service | `normalizeDomain`, `normalizePhone`, `normalizeEmail`, `normalizeCompanyName`, `findMatchingCompany`, `upsertCompany`, `upsertContact` | candidates | `{ record, created }` | system (callers check their own permission) | US-13 |
| API-16 | Action | `updateCompany`, `updateContact` | id, fields | record | `platform.directory.update` | US-13 |
| API-17 | Service | `notify(...)` | recipients, type, title, body?, link?, data?, channels?, dedupeKey? | notification IDs | system | US-11 |
| API-18 | Action | `listForUser`, `unreadCount`, `markRead(ids \| "all")` | cursor, ids | notifications | `platform.notification.read` | US-11 |
| API-19 | Action | `getPreferences`, `updatePreferences` | prefs | prefs | `platform.notificationPreference.update` | US-11 |
| API-20 | Route | `GET /api/notifications/stream` | — | unread count, latest items | signed in | US-11 |
| API-21 | Action | `updateMyProfile`, `updateAppearance`, `changePassword`, `listMySessions`, `revokeSession`, `setup2fa`, `regenerateBackupCodes` | per form | updated data | `platform.userSettings.update`, `platform.security.manage` | US-12 |
| API-22 | Service | `audit.record(tx, entry)`, `withAudit(tx, entry, fn)` | entry | — | system | US-14 |
| API-23 | Action | `listAudit`, `getAuditForTarget`, `exportAudit` | filters, cursor / range | entries / CSV file | `platform.audit.read`, `platform.audit.export` | US-14 |
| API-24 | Service/Action | `getSetting`, `setSetting`, `listSettings` | key, value | typed value | `platform.setting.read` / `platform.setting.update` | US-15 |
| API-25 | Action | `saveCredential`, `deleteCredential`, `testCredential` | provider, payload | masked status | `platform.credential.manage`, `platform.credential.test` | US-16 |
| API-26 | Service | `getCredential`, `resolveProviderKey`, `getCredentialStatus`, `rotateEncryptionKey` | provider | payload / status | system / `platform.credential.read` | US-16 |
| API-27 | Service | `runTask`, `streamTask`, `runBatch`, `registerTask`, `getTask` | task request | validated output + usage | system (callers check their own permission) | US-17 |
| API-28 | Action | `getUsageSummary({ from, to, groupBy })`, `getCostPerOutcome` | range | summaries | `platform.aiUsage.read` | US-17 |
| API-29 | Action | `updateAiBudgets`, `updateModelTiers` (via settings) | budgets | settings | `platform.aiBudget.update` | US-17 |
| API-30 | Action | `publishPromptVersion`, `activatePromptVersion`, `listPromptVersions`, `diffPromptVersions`, `runEvals` | task, note, force?, version | version / report | `platform.prompt.*`, `platform.eval.run` | US-18 |
| API-31 | Service | `enqueueJob(name, input, opts)` | name, input, actor, key? | `{ jobRunId, deduplicated }` | system | US-19 |
| API-32 | Action | `listJobRuns`, `getJobRun`, `retryJob`, `cancelJob`, `runJobNow`, `setScheduleEnabled` | filters / id | runs | `platform.job.*`, `platform.schedule.toggle` | US-19 |
| API-33 | Cron | `GET /api/cron/tick` | Vercel cron request | enqueued slots | cron secret | US-19 |
| API-34 | Service | `publish(event)`, `publishAfterCommit(tx, event)` | event envelope | — | system | US-22 |
| API-35 | Service | `putFile`, `getSignedUrl`, `deleteFile`, `createUploadUrl` | key, body, purpose, access | FileObject / URL | system; uploads need `platform.file.upload` | US-20 |
| API-36 | Route | `GET /api/health` | — | `{ status, version, commit, mocks }` | public | US-24 |
| API-37 | Route | `GET /api/dev/emails/[template]` | template id | rendered HTML | development only | US-11 |
| API-38 | Service | `getHomeSummary(userId)` (Phase 19 wires module widgets) | user | needs-you counts, widget data, alerts | `platform.home.read` | US-10 |
| API-39 | Client | `registerCommand`, `useShortcut` | command definition | — | per command permission | US-9 |

**Scheduled jobs (core):** `platform.notifications-digest`, `platform.job-runs-cleanup`, `platform.retention-purge`, `platform.credentials-health` (defaults in `docs/contracts/jobs.md`; final times in `docs/schedules.md`, Phase 19).

---

## 8. Screen states (core)

Patterns come from saas-ui and Phase 4's pattern library; this table says what each state contains. Every async view has all four; an error never renders as an empty success.

| Route | Loading | Error | Empty: first use | Empty: no results |
|---|---|---|---|---|
| R-1 `/login` | Button pending state while submitting | Generic "Email or password is incorrect"; rate-limit message with retry time | n/a | n/a |
| R-2 `/login/2fa` | Pending on verify | "That code didn't work" with remaining attempts; lockout message | n/a | n/a |
| R-3 `/invite/[token]` | Skeleton of the form while the token is checked | Expired, used or invalid invite: plain message and "Ask your admin for a new invite" | n/a | n/a |
| R-4 `/reset` | Pending on submit | Network error with retry | n/a | n/a |
| R-5 `/reset/[token]` | Token check skeleton | Expired or used link: message and link to `/reset` | n/a | n/a |
| R-6 `/setup-2fa` | QR placeholder skeleton | Setup failed: retry; wrong code: inline error | n/a | n/a |
| R-7 `/signed-out` | none (static) | n/a | n/a | n/a |
| R-8 `/` | Shell-matched skeleton: greeting line, needs-you row, widget frames | Per-widget error with "Try again"; whole-page error only if the session read fails | New user: "Your work will appear here" + link to first service line | "Nothing needs you right now" with the next scheduled item time |
| R-9 `/settings` | Section skeletons | Save failed: inline error with retry, form keeps its values | n/a | Sessions: only the current session listed |
| R-10 `/admin` | Status-row skeletons | Per-item error with retry | Fresh install: all green with "No failures in the last 24 hours" | n/a |
| R-11 `/admin/users` | Table skeleton | Error with retry | Only the first admin: "Invite your team" primary action | "No users match these filters" + clear filters |
| R-12 `/admin/team` | Table + capacity chart skeleton | Error with retry | No team profiles besides admin: "Invite people to service lines" | "No one on this line yet" |
| R-13 `/admin/integrations` | Provider list skeleton | Error with retry; failing provider rows show the last error | All "Not configured" with a Mock mode banner when `MOCKS=true` | n/a |
| R-14 `/admin/mailboxes` | Domain and mailbox skeletons | Error with retry; DNS check failure shows the failing record | "No sending domains yet" + add domain | "No mailboxes match" |
| R-15 `/admin/suppression` | Table skeleton | Error with retry | "No suppressions yet" + add / import | "No match for '<value>'" + clear |
| R-16 `/admin/data-requests` | Table skeleton | Error with retry | "No data requests" + create | "No requests match" |
| R-17 `/admin/prompts` | Grouped list skeleton | Error with retry | Tasks listed with "No published version" + publish action | n/a |
| R-18 `/admin/prompts/[task]` | Version list + diff skeleton | Eval run failure shows the report error | "No versions yet" + publish from files | n/a |
| R-19 `/admin/ai-usage` | Chart and table skeletons | Error with retry | "No AI calls yet" | "No calls in this range" + widen range |
| R-20 `/admin/jobs` | Runs table skeleton | Error with retry | "No job runs yet" + schedules table | "No runs match" + clear filters |
| R-21 `/admin/jobs/[runId]` | Step list skeleton | Not found for unknown IDs | n/a | n/a |
| R-22 `/admin/audit` | Table skeleton | Error with retry | "No audit entries yet" | "No entries match" + clear filters |
| R-23 `/admin/platform` | Form skeleton | Save failed inline | Postal address empty: prominent warning that outreach is blocked | n/a |
| R-24 `/dev/ui` | Gallery skeleton | Component render error boundary per tile | n/a | n/a |
| Any `(platform)` route without permission | — | `PermissionState`: "You don't have access to this" + link home | — | — |

---

## 9. Non-goals

- **No public signup** and no self-service account creation; staff join by invite only.
- **No client-facing pages** other than the public unsubscribe page (`/u/[token]`); no client portal, no public marketing site in this app.
- **No billing or payments** of any kind (no saas-billing features).
- **No multi-tenant or multi-company support**: FUTUREUNI only; no organisations, no org switching.
- **No native mobile apps**; the web app works down to 375px.
- **No impersonation** of users in this version.
- **No general-purpose file manager**; files exist only as attachments to module records.
- **No real-time collaboration** (live cursors, shared editing).

---

## 10. Risks and open questions

| Id | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RISK-1 | Parallel phases clash on shared files or drift from contracts | M | H | Ownership map + guard hook, contracts frozen in Phase 2, seams with fixed signatures, `REQUESTS.md` applied at merge (ADR-012, ADR-025, ADR-026) |
| RISK-2 | Loss of `CREDENTIALS_ENCRYPTION_KEY` makes every stored credential unrecoverable | L | H | Key stored in the team password manager (Phase 21), key versioning and `pnpm credentials:rotate`, runbook entry |
| RISK-3 | AI spend runs away through a loop or a large batch | M | M | Per-task token caps, platform/module/user budgets, 80% warning, hard block at 100% (US-17) |
| RISK-4 | Vercel Workflow or Cron limits change or a step exceeds function duration | M | M | Steps small and idempotent; Phase 20 checks every step against current limits; inline runner keeps tests independent |
| RISK-5 | Compliance services (suppression, consent, DSR, contactability) live in the acquisition module, but a future module that contacts people (for example Marketing) needs them, and modules may not import each other | H (when module 2 arrives) | M | Before the second contacting module is built, run a small platform phase that promotes compliance to `src/platform/compliance/` with the same API; until then acquisition owns it. Recorded as open question OQ-3 |
| RISK-6 | A single admin account is lost (no 2FA recovery) | L | H | Backup codes shown once, `resetUser2FA` by another admin, never fewer than one active admin; recommend two admins at launch |
| RISK-7 | Personal data leaks through logs or error reports | M | H | PII-free structured logs and Sentry scrubbing (saas-ship, ADR-030), INV-13, Phase 20 redaction checks |
| RISK-8 | Only a low-resolution PNG logo exists (no SVG, no wordmark, no dark variant) | H | L | Wordmark rendered as live text in the display face; request SVG + dark variant (OQ-1) |

**Assumptions to confirm**
- **A1** Staff count at launch is under 25 users. Default used: no pagination beyond cursor lists, no SSO beyond optional Google.
- **A2** The platform domain will be a subdomain such as `app.<futureuni-domain>`. Default used: `NEXT_PUBLIC_APP_URL` from env; decided in Phase 21.
- **A3** Everyone works mostly in `Africa/Lagos`; international staff set their own timezone. Default used: platform timezone `Africa/Lagos`.
- **A4** English only (`en`). Default used: no i18n framework; copy in plain English.

**Open questions**
- **OQ-1** Will FUTUREUNI supply an SVG logo, a wordmark and a dark-background variant? Owner: Prince. Default: use `docs/brand/futureuni-logo.png` on both themes plus a live-text wordmark; Phase 4 revisits when files arrive. (Doesn't block.)
- **OQ-2** What is FUTUREUNI's registered postal address for email footers? Owner: Prince. Default: `platform.postalAddress` empty, which blocks outreach sends (INV-4) until set. (Blocks real outreach only; Phase 21 gate.)
- **OQ-3** When should compliance move to the platform core? Owner: lead engineer. Default: when the second module that contacts people is specified (RISK-5).
- **OQ-4** Who are the first two admins? Owner: Prince. Default: Prince plus the lead engineer, both with 2FA.
- **OQ-5** Should Google sign-in be enabled at launch? Owner: Prince. Default: off (`AUTH_GOOGLE_ENABLED=false`) until FUTUREUNI uses Google Workspace for staff accounts.
- **OQ-6** Audit log retention? Owner: Prince. Default: kept indefinitely (no `platform.retention.auditLogMonths` purge) unless legal review says otherwise.

---

## 11. Milestones (platform scope)

The platform is built in phases, not vertical slices (ADR-029). Each milestone below maps to a build phase and lists acceptance criteria that phase prompts can quote (`P<phase>-AC<n>`). Acquisition milestones (phases 7–19) are in `docs/specs/module-acquisition.md` §11. Batches and parallelism: `phases/README.md`.

| Id | Phase | Goal | Skills | Stories |
|---|---|---|---|---|
| P0 | 0 Requirements | Specs, rules, contracts, data model, decisions, integrations, MCP config | saas-plan | — |
| P1 | 1 Scaffold | Strict Next.js project, tokens, env, local Postgres (native or Docker, ADR-004), Workflow proof, ownership guard, worktree helper, CI | saas-setup, saas-ship | US-24 |
| P2 | 2 Core schema | Prisma schema, migration, seed, contracts, db/directory/core helpers, registry, create-module | saas-data | US-13, US-21 |
| P3 | 3 Auth and team | Invite-only auth, 2FA, permission map, team services | saas-auth | US-1–US-7 |
| P4 | 4 Design system and shell | Tokens, components, patterns, charts, shell, home, `/dev/ui` | saas-ui | US-8–US-10, US-23 |
| P5 | 5 AI service | runTask, runtime skills, prompt versions, usage/cost, evals | saas-ai | US-17, US-18 |
| P6 | 6 Platform services | Jobs, cron, events, notifications, audit, settings, credentials, storage | saas-api, saas-notify | US-11, US-14–US-16, US-19, US-20, US-22 |
| P18 | 18 Admin and settings screens | Personal settings and every `/admin` screen | saas-ui | US-6, US-7, US-11–US-19 (UI) |
| P19 | 19 Integration | Home widgets on real data; counts agree everywhere | — | US-10 |
| P20 | 20 Hardening | Security, compliance, performance, accessibility, cost, chaos | saas-review, saas-testing | all |
| P21 | 21 Go-live | Production on Vercel Pro, real providers, monitoring, backups | saas-ship | all |

### P1: Scaffold
- **P1-AC1** Given a fresh clone, when `pnpm install`, `pnpm db:up` and `pnpm dev` run, then the placeholder home renders with the FUTUREUNI tokens and fonts in light and dark.
- **P1-AC2** Given `pnpm check`, then lint, typecheck, test and build all pass.
- **P1-AC3** Given a `phase/05-ai-service` branch, when Claude Code tries to write `src/platform/auth/x.ts`, then the ownership guard blocks it with the message naming the owner phase; on `main` the same edit is allowed.
- **P1-AC4** Given `pnpm phase start 99 test`, then a worktree with its own database `futureuni_p99` and port 3099 exists; `pnpm phase remove 99` removes both.
- **P1-AC5** Given `DATABASE_URL` unset, when the app builds, then it fails with a message naming `DATABASE_URL`.
- **P1-AC6** Given the lint fixtures, then the rules for `any`, cross-module imports, the Anthropic SDK outside `src/platform/ai` and raw hex colours all fire.

### P2: Core schema, contracts and registry
- **P2-AC1** Given `pnpm db:reset`, then the `init` migration applies and the seed completes; a second `pnpm db:seed` leaves row counts unchanged.
- **P2-AC2** Given every entity in `docs/specs/data-model.md`, then a Prisma model exists with every field, index and constraint listed.
- **P2-AC3** Given a second `ACTIVE` enrolment for the same company, a lead score of 101, or a negative money amount, when inserted by SQL, then each insert fails.
- **P2-AC4** Given each worked example in `docs/contracts/*.md`, then it parses with the matching schema in `src/contracts/`, and one invalid example per contract fails.
- **P2-AC5** Given `transitionLead` from `NEW` to `AUDITED`, then it fails with `INVALID_TRANSITION` and no `LeadEvent` is written (INV-15).
- **P2-AC6** Given the directory test cases in US-13, then all pass.
- **P2-AC7** Given `pnpm create-module sandbox "Sandbox"`, then registry generation, typecheck and build pass and the module appears in navigation (US-21 AC-21.1).

### P3: Auth, users, roles and team
- **P3-AC1** Every criterion of US-1 to US-7 passes in automated tests.
- **P3-AC2** Given the generated matrix test, when it walks every action × role × scope case in project-rules, then every result matches the matrix fixture.
- **P3-AC3** Given `@/platform/auth`, then it exports exactly the API in `docs/contracts/permissions.md` and its README shows one example per function.

### P4: Design system and shell
- **P4-AC1** Every criterion of US-8, US-9, US-10 (with seeded data) and US-23 passes.
- **P4-AC2** Given every `/dev/ui` page in both themes, when axe runs, then there are zero serious or critical violations.
- **P4-AC3** Given every text/background token pair in project-rules, then the contrast ratios in `src/styles/README.md` meet AA.

### P5: AI service
- **P5-AC1** Every criterion of US-17 and US-18 passes with the mock provider.
- **P5-AC2** Given `platform.summarize-company` with an input containing "ignore previous instructions", when it runs, then the output treats it as data and cites only supplied evidence IDs.
- **P5-AC3** Given an output that fails schema validation twice, then `runTask` throws `AI_OUTPUT_INVALID` and the `AiCall` outcome is `INVALID`.

### P6: Platform services
- **P6-AC1** Every criterion of US-11, US-14, US-15, US-16, US-19, US-20 and US-22 passes.
- **P6-AC2** Given a failing step 2 in a two-step job, when it retries, then step 1 does not run again.
- **P6-AC3** Given every platform email template, then an HTML and a plain-text rendering exist and the preview route renders each in development.

### P18: Admin and settings screens (platform part)
- **P18-AC1** Given each route R-9 to R-23, then its loading, error, empty and no-permission states render as in §8, at 375px and 1440px, in both themes, with zero serious or critical axe violations.
- **P18-AC2** Given a `MEMBER` or a `SERVICE_LEAD`, when they open `/admin`, then the no-permission state renders (`platform.admin.access`).
- **P18-AC3** Given a stored credential, when `/admin/integrations` renders, then no stored secret value appears anywhere in the HTML.

### P19: Integration (platform part)
- **P19-AC1** Given seeded data, when a `SERVICE_LEAD` opens `/`, then "My review queue", "My inbox" and "Pipeline value" show the same counts as the acquisition navigation badges (AC-10.4).

### P20: Hardening (platform part)
- **P20-AC1** Given the generated endpoint inventory, when each server action and route is called unauthenticated or by a role without permission, then each is refused, except the allow-listed public routes in §6.
- **P20-AC2** Given the raw `IntegrationCredential` column, when scanned, then no plaintext secret is found (INV-21).

### P21: Go-live (platform part)
- **P21-AC1** Given production, when the `@smoke` suite runs with a dedicated test user, then it passes without sending any real outreach.
- **P21-AC2** Given last night's backup, when it is restored into a fresh Neon branch and a preview points at it, then an admin can sign in and see the data; the time taken is recorded in `docs/runbook.md`.
