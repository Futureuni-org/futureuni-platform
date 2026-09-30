# Phase 07 change requests

Applied at the Wave-2 batch B2 integration (docs/prompts/wave-2/wave-2-prep-and-merge.md Part C3).

---

## CR-07-01 · Add `pnpm profiles:check` script

- **Kind:** package.json script (Phase 1).
- **What to change at merge:** add `"profiles:check": "tsx --conditions=react-server src/modules/acquisition/profiles/check.ts"` to `package.json` scripts. The script exists in this branch under `src/modules/acquisition/profiles/check.ts` and sanity-checks the runtime references + resolvers on demand.

## CR-07-02 · Register `profilesAiTasks` and `profilesSettings` on the acquisition manifest

- **Kind:** manifest wiring (Phase 19).
- **What to change at merge:** `src/modules/acquisition/manifest.ts` should merge `[...profilesAiTasks]` into `aiTasks` and `[...profilesSettings]` into `settings`. Currently the manifest only carries the base scaffold; Phase 19 owns the merge across every acquisition area.

## CR-07-03 · Phase 4 home widgets → real acquisition services

- **Kind:** coordination note.
- **Motivation:** Phase 4 shipped placeholder `acquisition.review-queue`, `acquisition.inbox` and `acquisition.pipeline-value` widgets that read seeded rows directly. Once acquisition wires up its own service reads (Phase 19 wave), replace those placeholders with the module's own widget renderers.

## CR-07-04 · Phase 8 pricing / portfolio hydration

- **Kind:** coordination note (Phase 8).
- **Motivation:** when Phase 8 materialises a lead from a search hit, it should call `getPricingForLine(profile, packageId)` and `resolvePortfolio(profile, { market })` to seed lead-side references. Documented for the Wave-2 integration log.

## CR-07-05 · Wire `SEAM-PROFILE` in Phase 9 to `@/modules/acquisition/profiles`

- **Kind:** seam wiring (Phase 9 provider replacement).
- **What to change at merge:**
  1. Find every `SEAM:SEAM-PROFILE` marker in Phase 9's tree (`src/modules/acquisition/enrichment/**`).
  2. Replace the stand-in call with `import { getActiveProfile, listActiveProfiles } from "@/modules/acquisition/profiles";`.
  3. Delete the stand-in file / block.
  4. Confirm `grep -rn "SEAM:SEAM-PROFILE" src/` returns nothing.

## Rejected: none.
