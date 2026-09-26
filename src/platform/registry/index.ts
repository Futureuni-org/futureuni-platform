/**
 * @/platform/registry: the module registry (docs/contracts/module-manifest.md). Server-only.
 * Manifests import their helpers from "@/platform/registry/define" instead (no import cycle).
 */

export {
  getAllAiTasks,
  getAllJobs,
  getAllModules,
  getAllPermissions,
  getAllSubscribers,
  getCommands,
  getCronSchedules,
  getDynamicScheduleProviders,
  getEnabledModules,
  getHomeWidgets,
  getNavigation,
  mayOpen,
  getNotificationTypes,
  getSettingDefinitions,
  getSettingsPanels,
  resolveBadge,
  type EnabledSettingsReader,
  type NavigationUser,
} from "./registry";
export { defineJob, defineModule, defineSetting, permission, scopes } from "./define";
export { coreManifest } from "./core-manifest";
export { CORE_MODULE_ID, RESERVED_ROUTE_PREFIXES, validateManifests } from "./validate";
