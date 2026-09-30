# src/modules/acquisition/profiles/

**Owner: Phase 07 (Service-line profiles).** The four service-line profiles + the runtime
FUTUREUNI knowledge (`runtime-skills/acquisition/_references/`). The engine reads profiles
and never hardcodes line-specific behaviour (ADR-008). Contract:
`src/contracts/service-line-profile.ts` and `docs/contracts/service-line-profile.md`.

## Public API

```ts
import {
  // SEAM-PROFILE (Phases 8, 9, 10 consume these)
  getActiveProfile, listActiveProfiles,
  getProfileVersion, listProfileVersions, getDraft,
  // Writes (Phase 18 UI actions)
  saveDraft, publishProfile, rollbackProfile,
  // Validation
  validateProfile, hasErrors,
  // Resolvers (Phases 11, 12, 14, 17)
  resolvePitchAngle, resolvePortfolio, getPricingForLine, selectAcquisitionReferences,
  // Diff (Phase 18 version-history)
  diffProfiles,
  // Line owners (Phase 12 assignment, Phase 18 UI)
  getLineOwners,
  // Manifest inputs — Phase 19 wires these at Wave-2 integration
  profilesSettings, profilesAiTasks,
  // Defaults (tests + seeder)
  DEFAULT_PROFILES,
} from "@/modules/acquisition/profiles";
```

## Rules

- **INV-16** — exactly one active `ServiceLineProfileVersion` per line, enforced by a
  partial unique index. `publishProfile` and `rollbackProfile` deactivate the current
  active row inside a single transaction before activating the target.
- **INV-19** — placeholders (`isPlaceholder: true` portfolio items) never leave
  `resolvePortfolio`. Outreach (Phase 12) attaches only what this function returns.
- **INV-20** — every publish, rollback and draft save writes an audit log entry via
  `@/platform/audit-log`.
- **Read-only IDs after publish** — signal / pitch-angle / package / sequence / rule /
  portfolio IDs must not be renamed; do "retire and add" instead.
- **Pricing** — `pricing.needsReview: true` is a launch gate (Phase 21). Wave-2's seeded
  values are placeholders; every figure is confirmed by Prince before go-live.

## Editing a profile

1. `saveDraft(actor, line, profile)` upserts the single open DRAFT row.
2. `validateProfile(profile, known?)` — call this before saving in the UI to show inline
   errors.
3. `publishProfile(actor, line, note)` runs validation, deactivates the current active
   version, activates the draft, audits, and emits `profile.published`.
4. `rollbackProfile(actor, line, version, note)` re-activates an older published version
   as the current active (same audit + event emission).
5. `pnpm profiles:check` validates every default profile AND every active DB profile in
   one pass. Runs in CI as part of `pnpm check` (via lint/typecheck/tests but this script
   also runs standalone).

## Adding a new service line (post-launch)

A fifth service line is a new profile + a `ServiceLine` enum value (Phase 2 change
request), a code default file under `defaults/`, an entry in `DEFAULT_PROFILES`, and a
reference file under `runtime-skills/acquisition/_references/lines/`. No new code paths.
