import "server-only";

/**
 * `@/modules/acquisition/profiles` — the public API for service-line profiles.
 *
 * SEAM-PROFILE: `getActiveProfile` and `listActiveProfiles`. Phases 8/9/10 stub these
 * signatures during Wave 2 and wire the real implementations from here at Wave-2
 * integration (docs/prompts/wave-2-prep-and-merge.md Part C).
 *
 * Contract: `src/contracts/service-line-profile.ts`. This module is the ONLY writer
 * (repos, drafts, publishes, rollbacks) to `ServiceLineProfileVersion`.
 */

// SEAM-PROFILE + reads
export {
  getActiveProfile,
  listActiveProfiles,
  getProfileVersion,
  listProfileVersions,
  getDraft,
  type PublicVersionRow,
} from "./read.repo";

// Writes
export { saveDraft, publishProfile, rollbackProfile } from "./write";

// Validation
export { validateProfile, hasErrors } from "./validate";

// Resolvers
export {
  resolvePitchAngle,
  resolvePortfolio,
  getPricingForLine,
  selectAcquisitionReferences,
  type PitchAngle,
  type PortfolioItem,
  type PricingPackage,
  type ReferenceMarket,
} from "./resolve";

// Diff (Phase 18 version-history screen)
export { diffProfiles, type ProfileDiff, type ProfileDiffEntry } from "./diff";

// Line owners
export { getLineOwners, type LineOwner } from "./owners";

// Manifest inputs for Wave-2 integration (Phase 19 wires them in)
export { profilesSettings } from "./settings";
export { profileSanityTask, profilesAiTasks } from "./tasks";

// Defaults (Phase 7 seeder + tests)
export { DEFAULT_PROFILES } from "./defaults";
