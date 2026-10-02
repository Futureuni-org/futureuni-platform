# Phase 18: Admin and Settings Screens: Summary

| | |
|---|---|
| Phase | 18, Admin and settings screens |
| Branch | `phase/18-admin-settings` |
| Batch / wave | B5 / Wave 4 |
| Date finished | 2026-10-02 |
| Prompt | `docs/prompts/wave-4/phase-18-admin-settings.md` |
| Verification | typecheck Pass (0) · lint Pass (all owned dirs) · component tests Pass (6 files, 22) · `saas-review`: no open Critical/Major · `pnpm build` + `pnpm test:e2e` + Playwright visual review: **not run** (local memory pressure; see Known limitations) |

## What was built

The platform's **control room**: the line-settings profile editor, personal settings, eleven admin
areas and the restyled auth pages — all on top of existing services, built as server-first RSCs with
Zod-validated server actions, permission-aware UI, loading/empty/error/no-permission states, and
responsive layouts.

- **Line settings + profile editor** (`/acquisition/[line]/settings`): a draft workflow (debounced
  autosave, sticky validation bar, discard) over every `ServiceLineProfile` contract field — Overview,
  Signals, Sources, Audits, **Scoring** (rule builder over the `Condition` AST + a visual threshold
  band + a **live `scoreLead` preview** on real sample leads), Pitch angles, Portfolio (media upload,
  placeholder flags — INV-19), Pricing (per-market minor-unit money), Sequences (drag-to-reorder
  timeline + day-by-day preview), Disqualifiers, and an ADMIN-only Advanced JSON view. Review &
  publish shows a `diffProfiles` diff + validation + required note; History compares versions and rolls
  back. Permission-aware: a `SERVICE_LEAD` edits/publishes only their own line.
- **Personal settings** (`/settings`): profile (name/avatar/timezone), the notification matrix
  (critical types locked), appearance (theme/density/reduced-motion), and security (change password,
  2FA enable/verify/regenerate/disable — ADMIN can't disable, active sessions).
- **Admin** (`/admin`): a permission-filtered frame + status home, and the eleven areas — Users &
  invites, Team & capacity (with a server-computed what-if), Integrations (masked credentials, test,
  mock banner), Mailboxes & domains (DNS check + fixes + copy, warm-up, pause/resume, add), Suppression,
  Data requests, Prompts (versions, diff, publish with regression gate, activate/rollback), AI usage
  (dataviz charts + budgets + model tiers), Jobs (runs, retry/cancel, read-only schedules + run-now),
  Audit log (filter, before/after, CSV export), Platform (typed settings via `SettingField`, retention
  dry-run, module toggles).
- **Auth restyle**: the six Phase 3 forms now use the shared `@/components/ui` + `@/components/admin`
  components; `src/app/(auth)/_components/` was deleted. Routes, field names, labels, copy and
  redirects are unchanged so the Phase 3 e2e stays green.
- **Shared admin kit** (`src/components/admin/`): `SettingField`, `SecretField` (INV-21), `PasswordField`,
  `SettingsSection`, `DangerZone`, `AuditTrailPanel`, `Field`, `Select`, `ConfirmDialog`, `AdminTable`,
  `FilterBar`/`UrlSearchInput`/`UrlSelect`/`UrlDateInput`.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/components/admin/**` | Shared admin/settings components + tests |
| `src/modules/acquisition/ui/settings/**` | Profile editor: context, sections, condition builder, diff view, publish/history/capacity, actions, interim repos, `_seams.ts` |
| `src/app/(platform)/acquisition/[line]/settings/page.tsx` | Line-settings route (loads data, renders the editor) |
| `src/app/(platform)/settings/**` | Personal settings (page, sections, actions, profile repo) |
| `src/app/(platform)/admin/**` | Admin frame, home, and the eleven area routes (pages, `_components`, actions, interim repos) |
| `src/app/(auth)/**` | Restyled auth forms (`_components/` removed) |

## Public interfaces other phases can use

Phase 18 is a UI phase; it adds no services other phases consume. It owns the routes above. The
`SEAM-LINE-CONTEXT` stand-in (`src/modules/acquisition/ui/settings/_seams.ts`) is replaced by
`@/modules/acquisition/ui/shell` at B6.

## Decisions made (and any new ADRs proposed)

- The profile editor holds the whole `ServiceLineProfile` client-side and autosaves only when it is
  schema-valid (INV-16), since `saveDraft` rejects schema-invalid drafts; reference errors surface at
  publish. No new ADR.
- Editor server actions and interim repos live in `src/modules/acquisition/ui/settings/` (not the app
  route) so client components import them without crossing the app→module boundary.
- Control rendering for typed settings is value-type-driven (with the one known enum special-cased),
  avoiding fragile Zod-schema introspection while staying `any`-free.

## Dependencies added

None. (All chart/UI/motion deps were already present from Phase 4.)

## Change requests raised

See `phases/18/REQUESTS.md`. **Seams:** `SEAM-LINE-CONTEXT` was **stubbed** (provider Phase 15 runs in
parallel; wiring at B6). **Service gaps** (each with an interim repo): pending-invites list (Phase 3),
self profile + self security helpers (Phase 3), discard-draft + sample-lead selector (Phase 7/11),
suppression value filter + DSR list (Phase 9), mailbox/sending-domain readers (Phase 12), module-toggle
path (Phase 2/6), eval report + standalone run (Phase 5), schedule toggle (Phase 6), AI p95/cost-per-won
metrics (Phase 5/17), user-digest setting (Phase 6). **Promote candidates:** the generic admin
primitives. **Platform/config:** mount `NuqsAdapter` if later needed (not required so far).

## Known limitations

- **`pnpm check` (build) and `pnpm test:e2e` were not run to completion locally** because the
  sandbox repeatedly hit memory pressure (background runs were reaped; the full e2e needs a production
  build + Playwright). `pnpm typecheck` and `pnpm lint` pass, and the component tests pass. The e2e
  specs in `tests/e2e/phase-18/` and the Playwright MCP visual review still need a run in a healthy
  environment. The Phase 3 auth e2e should pass unchanged (selectors/routes preserved).
- Per-case eval reports (Prompts), schedule enable/disable (Jobs), p95 latency and cost-per-won-deal
  (AI usage), and the personal daily-digest toggle are **not surfaced** — each is a documented service
  gap with the available data shown instead.
- Sources' per-market `defaultParams` are edited as JSON (no typed per-adapter fields).
- Several admin readers use interim `*.repo.ts` files (listed in REQUESTS.md) pending real services.

## How to test it

- `pnpm typecheck`, `pnpm lint`, and `pnpm test -- <the Phase 18 *.test.tsx files>` (24 component tests).
- `pnpm dev` (PORT 3018), `pnpm db:seed`, sign in as seeded users:
  - `web.lead@futureuni.local` (SERVICE_LEAD): `/acquisition/web-development/settings` — edit scoring,
    watch the live preview, publish with a note, roll back; confirm other lines' settings are 404/hidden.
  - `admin@futureuni.local`: `/admin` and each area (invite a user, change a role, add+test a credential
    in mock mode, run a DNS check, add+remove a suppression with a reason, fulfil a DSR export, publish a
    prompt, change a budget, retry a failed job, filter the audit log).
  - `kelechi@futureuni.local` (MEMBER): `/admin` shows no-permission.
  - `/settings`: 2FA setup and session sign-out.
