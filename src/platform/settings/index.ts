/**
 * @/platform/settings: typed settings store.
 *
 * SEAM-SETTINGS-AI wires into `getSetting`.
 */

import "server-only";

export {
  getSetting,
  listSettings,
  setSetting,
  withSettingsRequest,
  type SettingListItem,
} from "./service";
export { PLATFORM_SETTINGS } from "./definitions";
