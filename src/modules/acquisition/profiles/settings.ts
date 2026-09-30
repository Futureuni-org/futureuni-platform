import "server-only";

/**
 * Settings this area registers. Phase 19 wires them into the acquisition manifest at
 * Wave-2 integration; the list is echoed in `phases/07/REQUESTS.md`.
 *
 * Wave-1 review of the settings surface: Phase 7 does not register any new keys today.
 * If a future edit needs a profile-scoped setting (e.g. `acquisition.profile.previewSampleSize`),
 * add it here (using `defineSetting`) and to REQUESTS.md.
 */

import type { SettingDefinition } from "@/contracts/module-manifest";

// Empty until a real setting is needed; typed as `SettingDefinition<unknown>[]` so it can
// hold entries with different value types without loosening later definitions.
export const profilesSettings: readonly SettingDefinition[] = [];
