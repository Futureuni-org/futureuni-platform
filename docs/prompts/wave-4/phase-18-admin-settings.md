# Phase 18: Admin and Settings Screens

> **How to run this phase**
> 1. Wave 3 must be merged and integrated, and Part A of `wave-4-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 18 admin-settings`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-18-admin-settings.md and execute it. Plan first."**
>
> Wave 4. Runs in parallel with Phases 15, 16 and 17. Depends on Waves 0–3.

---

## Your role and the goal of this phase

You build **the control room**: every screen that configures and governs the platform, on top of services that already exist.

1. **Line settings and the profile editor** (`/acquisition/[line]/settings`): edit a service line's profile (signals, sources, audits, scoring rules, pitch angles, portfolio, pricing, sequences, disqualifiers, approval mode, capacity policy) with drafts, validation, a **live scoring preview**, a diff before publishing, version history and rollback.
2. **Personal settings** (`/settings`): profile, notification preferences, appearance, and security (2FA, sessions).
3. **Admin** (`/admin/*`):
   - users and invites
   - team and capacity
   - integrations and credentials
   - mailboxes and sending domains
   - the suppression list
   - data-subject requests
   - prompt versions
   - AI usage and cost
   - jobs and schedules
   - the audit log
   - platform settings and modules
4. **A restyle of the auth pages** (Phase 3) with the shared components, keeping their behaviour identical.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (roles and the permission matrix; invariants 2, 4, 6, 10 and 13; bans) and `docs/decisions.md`
2. `docs/specs/platform.md` (settings, admin, notifications, credentials, audit) and `docs/specs/module-acquisition.md` (line settings, profiles, capacity, approval modes)
3. `docs/contracts/service-line-profile.md`: the editor must cover **every field**
4. **`docs/prompts/wave-4-prep-and-merge.md`:** the route map, `SEAM-LINE-CONTEXT` (consumer), and **the UI quality bar (B3), in full**
5. `phases/04/SUMMARY.md` and the `/dev/ui` gallery
6. The service READMEs:
   - `@/modules/acquisition/profiles` (draft, validate, publish, diff, rollback)
   - `@/modules/acquisition/scoring` (`scoreLead`, a pure function you can call for the preview; throttle)
   - `@/modules/acquisition/outreach` (mailboxes, DNS checks, health, warm-up)
   - `@/modules/acquisition/compliance` (suppressions, consent, DSR, country rules, read-only)
   - `@/platform/auth` and `@/platform/team` (users, invites, roles, 2FA, sessions, team profiles, capacity)
   - `@/platform/credentials` (save, status, test, delete)
   - `@/platform/settings`, `@/platform/notifications` (preferences, types)
   - `@/platform/ai` (prompt versions, publish with evals, usage summary, budgets through settings)
   - `@/platform/jobs` (runs, retry, cancel, schedules)
   - `@/platform/audit-log`
   - `@/platform/registry` (modules, enablement)
7. `phases/*/SUMMARY.md` for every completed phase
8. The global skills **`saas-ui`** (forms, dashboards and admin patterns), `saas-auth` (for the security screens), `dataviz` (the AI usage charts), `saas-testing` and `saas-review`

---

## What you own

- `src/app/(platform)/acquisition/[line]/settings/**`
- `src/app/(platform)/settings/**` and `src/app/(platform)/admin/**`
- `src/modules/acquisition/ui/settings/**`
- `src/components/admin/**`
- `alsoAllow`: `src/app/(auth)/**`, for the restyle only
- `phases/18/**`

---

## Step 1: Admin frame

- **The `/admin` layout:**
  - a secondary navigation: Users, Team, Integrations, Mailboxes, Suppression, Data requests, Prompts, AI usage, Jobs, Audit log, Platform
  - each item is visible per the permission matrix (most are `ADMIN`; some are `MANAGER`, such as jobs retry and team capacity)
  - on mobile, the navigation becomes a Sheet
- **The `/admin` home:** a calm status page.
  - integration health (failing providers)
  - mailboxes paused
  - AI spend against budget
  - failed jobs in the last 24 hours
  - pending invites
  - open data requests
  - each item links through
- **Shared admin components** (`src/components/admin/`):
  - `SettingField`: renders a typed setting from its Zod schema, showing the label, description, default, the current value, and a "reset to default" action
  - `SettingsSection`
  - `DangerZone`
  - `AuditTrailPanel`: the recent audit entries for this object
  - `SecretField`: masked value, reveal-never, replace-only

---

## Step 2: Line settings and the profile editor (`[line]/settings`)

The section is set through `?section=`. The page shows the **active version**, and any **draft** is highlighted.

1. **Draft workflow:**
   - "Edit" creates or opens a draft.
   - A sticky bar shows the draft state, validation status ("3 errors, 2 warnings") and actions: Save draft, Discard, **Review and publish**.
   - Autosave the draft with debounce, and warn before leaving with unsaved changes.
2. **Sections,** one form per contract area, with no outer boxes (sectioned forms, per saas-ui):
   - **Overview:** label, description, owners (user picker, filtered to the line's team), approval mode (`ALWAYS_REVIEW` or `AUTO_SEND_ABOVE_SCORE` with its threshold), and capacity policy.
   - **Signals:** an editable list: ID (read-only once published), label, description, weight, markets, evidence needed, detecting sources and confirming audits.
   - **Sources:** per market, choose the adapters (showing disabled adapters with their reasons) and their default parameters (keywords, place types, job titles, regions), with typed fields per adapter.
   - **Audits:** agents and checks, each required or optional.
   - **Scoring:**
     - a **rule builder**: condition picker (signal present, finding severity for a check, company attribute, contact status, market, legal form), points, and a label
     - thresholds and the borderline band, on a slider with a visual scale
     - **Live preview:** pick 5–10 real leads from this line (or a random sample) and see their current score against the draft score, with the reasons, updated as rules change. This runs the pure `scoreLead` on the server with the draft rules.
   - **Pitch angles,** per market: hook, when to use, proof tags, and phrases to avoid. A warning appears where an angle has no non-placeholder proof.
   - **Portfolio:** a gallery manager (title, description, URL, media upload through storage, tags, markets, outcome metric, **placeholder flag**). Placeholders are clearly marked and never attached to outreach.
   - **Pricing:** packages per market with currency inputs (NGN for Nigeria; USD, GBP and EUR for international), what's included, and ranges. `needsReview` is shown prominently until cleared.
   - **Sequences:** a per-market **visual timeline builder**: steps with channel (email, WhatsApp assisted, LinkedIn assisted, call task), delay in business days, purpose and pitch angle, with drag to reorder. A preview shows what a lead experiences, day by day.
   - **Disqualifiers:** an editable list.
   - **Advanced (`ADMIN` only):** the JSON view of the draft, editable with schema validation, and a warning.
3. **Review and publish:**
   - a full-screen diff (`diffProfiles`) grouped by section, in plain language ("Scoring: `no_website` weight 20 → 25")
   - validation results
   - a required changelog note
   - **Publish** (permission per the matrix: a `SERVICE_LEAD` can publish their own line)
4. **History:** the list of versions (who, when, note), view any version read-only, diff any two, and **Roll back** (with confirmation and audit).
5. **Capacity view,** for this line: owners with load against capacity, the throttle mode, and the nurture-held count, linking to `/admin/team`.

---

## Step 3: Personal settings (`/settings`)

- **Profile:** name, avatar (storage upload), timezone.
- **Notifications:** a matrix of notification types × channels (in-app, email), from the types registry. Critical types are locked on, with a lock and a tooltip. Also the daily digest toggle.
- **Appearance:** theme (light, dark, system), density, reduced motion.
- **Security:**
  - change password (strength meter)
  - **2FA:** set up, show backup codes once, regenerate, disable (not allowed for `ADMIN`)
  - **active sessions:** device, location if available, last active, sign out one or all

---

## Step 4: Admin screens

1. **Users** (`/admin/users`):
   - a users table: name, email, role, service lines, 2FA status, last active, status
   - **invite** (email, role, service lines; role options limited by the inviter's role)
   - pending invites (resend, revoke)
   - change role (with the consequence explained: sessions rotate)
   - deactivate or reactivate
   - reset 2FA
   - force sign-out
   - the last-admin protection is surfaced clearly
2. **Team** (`/admin/team`):
   - each person's service lines, weekly capacity (editable), current load, `canApprove`, and timezone
   - a per-line capacity summary with the throttle mode and a small load chart
   - what-if hint: "Raising Blessed's capacity to 6 would move Graphic Design from PAUSED to SLOW." Compute it with the throttle rules on the server.
3. **Integrations** (`/admin/integrations`):
   - a list of providers from the credentials registry: label, purpose, used by, status (not configured, OK, failing), last tested, masked value
   - **Add or replace** a credential through `SecretField` (the payload validated by the provider schema; the value is never shown again)
   - **Test connection** (live result)
   - delete (in a danger zone)
   - docs and signup links
   - a clear "Mock mode" banner when `MOCKS=true`
4. **Mailboxes and domains** (`/admin/mailboxes`):
   - sending domains with a **DNS check** result (SPF, DKIM, DMARC, MX), each pass or fail **with the exact record to add** and a copy button, plus re-check
   - mailboxes: address, domain, provider, status, **warm-up progress** (a day counter, today's cap against the target), sends today against the cap, bounce rate, reply rate, health state
   - pause/resume, add a mailbox (with credential connection), edit caps and send-window defaults
   - a "Before you send for real" checklist panel, from Phase 12's summary
5. **Suppression** (`/admin/suppression`):
   - search by value
   - filter by type and reason
   - add (type, value, reason)
   - **import a CSV**
   - remove (`ADMIN` only, with a required reason and a warning)
   - each entry shows its source (unsubscribe link, reply, bounce, manual, DSR) and date
   - DSR-derived hashed entries show as "Hashed (data request)" with no value
6. **Data requests** (`/admin/data-requests`):
   - create (export or delete; email or phone; requester and notes)
   - a list with status
   - fulfil an export (download link)
   - fulfil a delete (a strong confirmation explaining anonymisation plus hashed suppression)
   - the audit trail for each request
7. **Prompts** (`/admin/prompts`):
   - AI tasks grouped by module, each showing the active version, last eval score and last published date
   - the task page: the version list, **diff** between versions, the eval report for each version (per-case table)
   - **Run evals** (mock, or live with a spend cap confirmation)
   - **Publish** from the current files (a changelog note; blocked when the evals regress, with an `ADMIN` "force" option that requires a reason)
   - **Activate** or **Roll back**
8. **AI usage** (`/admin/ai-usage`), charts built with the dataviz skill:
   - spend over time against the daily and monthly budgets
   - by module, task, model and user
   - calls by outcome (ok, repaired, invalid, timeout, quota blocked)
   - p95 latency by task
   - cost per won deal (from Phase 17's service, if merged; otherwise from `getCostPerOutcome`)
   - **budget settings:** platform daily and monthly, per module, per-user calls, with the current usage shown next to each
   - model tier mapping, `ADMIN` only
9. **Jobs** (`/admin/jobs`):
   - a runs table (name, status, started, duration, attempts, counts, error summary) with filters
   - a run detail page with steps and progress
   - **Retry** and **Cancel** (per the matrix)
   - a schedules table: static and dynamic (saved searches), the next run in the platform timezone, enable/disable
   - "Run now" for jobs that allow it
10. **Audit log** (`/admin/audit`):
    - filterable by actor, action, target type, target ID and date
    - an entry detail with the before/after diff (sensitive keys shown as redacted)
    - CSV export for a range
11. **Platform** (`/admin/platform`):
    - postal address (required for outreach; a warning if empty)
    - platform timezone
    - retention periods (with the purge dry-run preview from the compliance and platform services)
    - module enable/disable (from the registry)
    - the Google sign-in allowed-domains setting (Phase 3)
    - the default booking URL and other acquisition-wide settings
    - every field rendered with `SettingField`

---

## Step 5: Restyle the auth pages (`src/app/(auth)/`)

- Replace Phase 3's local primitives with the shared components.
- Keep **every behaviour, route, validation and test identical**.
- Follow the visual direction ADR.
- Delete `src/app/(auth)/_components/` once it's unused.
- Phase 3's end-to-end tests must still pass unchanged.

---

## Step 6: Tests and quality

Meet **every item in the Wave 4 UI quality bar (B3)**. In addition:

- **Component tests:**
  - `SettingField` for each schema type
  - `SecretField` never renders a stored value
  - the scoring rule builder, and the preview updating
  - the sequence timeline builder, with reorder
  - the publish diff rendering
  - the notification matrix locks on critical types
  - the DNS record copy
- **Playwright,** in `tests/e2e/phase-18/`:
  - as `SERVICE_LEAD`: edit own line's scoring, see the preview change, publish with a note, roll back; can't open another line's settings
  - as `ADMIN`:
    - invite a user
    - change a role
    - add and test a credential in mock mode
    - run a DNS check
    - add and remove a suppression (with a reason)
    - fulfil a DSR export
    - run the evals and publish a prompt version (and see a regression block)
    - change a budget
    - retry a failed job
    - filter the audit log
  - as `MEMBER`: `/admin` shows no-permission
  - personal settings: 2FA setup and session sign-out
  - the auth pages' Phase 3 tests still pass
- **Playwright MCP visual review** (B3.14), including the long forms at 375px.

---

## Constraints

- **Only use the existing services.** Secrets are never displayed after saving.
- **No schema, contract or service edits outside your folders.** Raise requests.
- **No new generic primitives** (B3.1), except the admin components in your own `src/components/admin/`.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The profile editor covers every contract field, with drafts, validation, a live scoring preview, a visual sequence builder, a portfolio manager with placeholder flags, pricing per market, a diff before publishing, history and rollback.
- [ ] Personal settings work: profile, notification matrix, appearance, 2FA and sessions.
- [ ] All eleven admin areas in Step 4 work, each permission-aware, with its states.
- [ ] The auth pages are restyled with the Phase 3 tests unchanged and passing.
- [ ] The Wave 4 UI quality bar is met, the tests pass, and axe is clean.
- [ ] `pnpm check` and `pnpm test:e2e` pass.
- [ ] `saas-review` is clean of Critical and Major findings, with attention to secret handling and permissions.
- [ ] `phases/18/SUMMARY.md` (with visual review notes) and `phases/18/REQUESTS.md` are written.
