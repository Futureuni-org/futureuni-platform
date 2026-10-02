# Phase 18 — Change requests

Applied at Wave 4 integration (B5 for everything except SEAM-LINE-CONTEXT, which is wired at B6).
Each entry: ID · type · what · why.

## Seams

- **CR-18-SEAM-1 · seam wiring.** `SEAM-LINE-CONTEXT` is **stubbed** in
  `src/modules/acquisition/ui/settings/_seams.ts` (markers `// SEAM:SEAM-LINE-CONTEXT`).
  Phase 15 provides the real `resolveLine` / `lineHref` / `LINE_SLUGS` from
  `@/modules/acquisition/ui/shell`. At B6: repoint every import of `./_seams` (and
  `../settings/_seams`) to `@/modules/acquisition/ui/shell`, delete `_seams.ts`, and confirm
  `grep -r "SEAM:" src` is empty.

## Primitives to promote (B3.1 candidates)

Built locally under `src/components/admin/` because Phase 4 did not ship them. Generic ones are
candidates to promote into `src/components/ui` / `src/components/patterns`; the admin-specific ones
stay in `src/components/admin/`.

Generic (promote candidates):
- **`Select`** (`select.tsx`) — styled native `<select>` → `@/components/ui/select`.
- **`Field`** (`field.tsx`) — label/description/error wrapper (render-prop control) → `@/components/ui`.
- **`ConfirmDialog`** (`confirm-dialog.tsx`) — AlertDialog with reason / type-to-confirm → `@/components/ui/alert-dialog`.
- **`AdminTable`** (`admin-table.tsx`) — responsive table → card list below `md` → `@/components/patterns/data-table`.
- **`FilterBar` / `UrlSearchInput` / `UrlSelect` / `UrlDateInput`** (`filters.tsx`) — URL-synced
  filters via `next/navigation` → `@/components/patterns/filters`.

Admin-specific (stay in `src/components/admin/`): `SettingField`, `SecretField`, `SettingsSection`,
`DangerZone` / `DangerRow`, `AuditTrailPanel`.

- **`PasswordField`** (`src/components/admin/password-field.tsx`) — password input + client strength
  meter (reuses `checkPassword`); used by the restyled auth pages and personal security settings →
  candidate for `@/components/ui/password-field`.

**Auth restyle (Step 5):** the Phase 3 auth forms now use `@/components/ui` `Input`/`Button`,
`@/components/admin` `Field`/`PasswordField`, and inline token banners; the local
`src/app/(auth)/_components/` folder was deleted. Routes, field `name`s, accessible labels, copy and
redirects are unchanged so the Phase 3 e2e stays green (to be confirmed in the Stage 4 e2e run).

Stage 2 added more local editor building blocks in `src/modules/acquisition/ui/settings/`
(`editor-fields.tsx`: TextField/TextAreaField/NumberField/SelectField/CheckboxField/ChipMultiSelect/
StringListField/JsonObjectField/ItemCard/AddButton; `condition-builder.tsx`; `diff-view.tsx`; the
dnd-kit sequence timeline). These are profile-editor-specific composites and stay in the module;
the generic `JsonObjectField`, `ChipMultiSelect`, `StringListField` and a minor-unit `CurrencyInput`
are candidates to promote into `@/components/ui` later.

**Known limitation (not a request):** the Sources section edits each adapter's per-market
`defaultParams` as JSON, not typed per-adapter fields — a typed editor needs the adapter registry's
`paramsSchema`, which isn't exposed to the UI. The server still validates params against the
adapter schema on publish.

## Service gaps (raise to the owning phase)

- **CR-18-GAP-DSR-LIST · service gap (Phase 9 / compliance).** `@/modules/acquisition/compliance`
  has `createDataSubjectRequest` / `fulfilExport` / `fulfilDelete` but no reader. Add
  `listDataSubjectRequests(actor, query)` and `countOpenDataSubjectRequests(actor)` (perm
  `acquisition.dsr.manage`). Interim: `src/app/(platform)/admin/data-requests/data-requests.repo.ts`
  reads the rows directly; replace it with the service at integration.
- **CR-18-GAP-SUPPRESSION-SEARCH · service gap (Phase 9 / compliance).** `listSuppressions` has no
  value search. Add a normalized exact/prefix `value` filter to `ListSuppressionsQuery`. Interim:
  the suppression screen filters the fetched window (limit 100) by substring, labelled
  "this page".
- **CR-18-GAP-DISCARD-DRAFT · service gap (Phase 7 / profiles).** The profiles module has
  `saveDraft` / `publishProfile` / `rollbackProfile` but no way to delete an open DRAFT. Add
  `discardDraft(actor, line)` (perm `acquisition.profile.edit`, audited). Interim:
  `src/modules/acquisition/ui/settings/profile-draft.repo.ts` deletes the draft row and audits it.
- **CR-18-GAP-SELF-PROFILE · service gap (Phase 3 / auth or team).** No SELF service updates the
  signed-in user's own name / avatar / timezone (team updates require ADMIN/MANAGER). Add a SELF
  profile service under `platform.userSettings.update`. Interim:
  `src/app/(platform)/settings/profile.repo.ts` writes the session user's `User`/`TeamProfile` rows,
  audited.
- **CR-18-GAP-SELF-SECURITY · service gap (Phase 3 / auth).** No SELF wrappers exist for change
  password, 2FA enable/verify/regenerate/disable, or session list/revoke. Phase 18 built them in
  `src/app/(platform)/settings/actions.ts` directly on Better Auth `auth.api.*` (changePassword,
  enableTwoFactor/verifyTOTP/generateBackupCodes/disableTwoFactor, listSessions/revokeSession/
  revokeOtherSessions), with the ADMIN-can't-disable-2FA rule enforced in the action. Consider
  promoting these into `@/platform/auth` as reusable self-service helpers.
- **CR-18-GAP-USER-DIGEST · setting gap (Phase 6 / settings).** The daily-digest setting
  (`notifications.digest.enabled`) is PLATFORM-scope (admin). There's no per-user digest toggle, so
  the personal Notifications screen omits it. Add a USER-scope `user.notifications.digestEnabled`
  setting (or a digest notification preference) for the personal toggle.
- **CR-18-GAP-SAMPLE-LEADS · service gap (Phase 11 / scoring).** The live scoring preview needs
  sample leads with their built `ScoringFacts`. `loadScoringInputs` is not exported. Add a
  `getSampleLeadsForLine(line, limit)` (or exported facts loader) to `@/modules/acquisition/scoring`.
  Interim: `src/modules/acquisition/ui/settings/sample-leads.repo.ts` loads the rows and composes
  facts via the pure `buildScoringFacts` + compliance's `getContactability`.

- **CR-18-GAP-LIST-INVITES · service gap (Phase 3 / auth).** No pending-invites reader. Add
  `listInvites(actor, { pending? })`. Interim: `src/app/(platform)/admin/users/invites.repo.ts`.
- **CR-18-GAP-MAILBOX-READERS · service gap (Phase 12 / outreach).** `listActiveMailboxes` returns
  only ACTIVE/WARMING with a minimal shape, and there's no sending-domain list reader. Add
  `listMailboxes()` (all statuses, with caps/warm-up/health) and `listSendingDomains()` (with DNS
  status). Interim: `src/app/(platform)/admin/mailboxes/mailboxes.repo.ts`.
- **CR-18-GAP-MODULE-TOGGLE · gap (Phase 2 registry / Phase 6).** `module.<id>.enabled` is read by
  the registry but isn't a registered `SettingDefinition`, so `setSetting` rejects it. Add a
  registry-owned enable/disable path (perm `platform.module.toggle`). Interim:
  `src/app/(platform)/admin/platform/platform.repo.ts` writes the PLATFORM row + audits.
- **CR-18-GAP-EVAL-REPORT · service gap (Phase 5 / ai).** No exported standalone eval run or
  per-version/per-case eval report (`evals/_runner` lives outside `src/`; `evalReportKey` is always
  null). The Prompts screen shows each version's `evalScore` and runs evals inside publish
  (regression-gated, ADMIN force); add `runEvals(task, {live?})` + a per-case report reader to
  surface the "Run evals" button and per-case table.
- **CR-18-GAP-SCHEDULE-TOGGLE · service gap (Phase 6).** Schedules have no runtime enable/disable and
  no surfaced next-run; the Jobs screen shows cron schedules read-only with "Run now" (enqueue). Add
  a schedule toggle (perm `platform.schedule.toggle`) and a next-run reader.
- **CR-18-GAP-AI-METRICS · service gap (Phase 5 / 17).** `getUsageSummary` doesn't aggregate p95
  latency, and cost-per-won-deal needs Phase 17 analytics (not built). The AI-usage screen omits p95
  and uses `getCostPerOutcome` for the cost breakdown; add latency aggregation and wire Phase 17's
  cost-per-won-deal when it lands.

## Platform / config

- **nuqs:** not required so far — URL state (`?section=`, filters, cursors) uses server
  `searchParams` + `next/navigation`. If a later stage needs client URL state that benefits from
  nuqs, mount `NuqsAdapter` in `src/app/(platform)/layout.tsx` (Phase 4-owned) at integration.
  (To be confirmed in Stage 2–4.)
