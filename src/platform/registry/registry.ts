import "server-only";

import { ServiceLine, type Clock } from "@/contracts/common";
import type { AnyJobDefinition, CronSchedule, DynamicScheduleProvider } from "@/contracts/jobs";
import type { AnyTaskDefinition } from "@/contracts/ai-service";
import type { AnySubscriberDefinition } from "@/contracts/events";
import type {
  CommandDefinitionSchema,
  HomeWidgetSchema,
  ModuleManifest,
  NavItem,
  NotificationTypeDefinition,
  SettingDefinition,
  SettingsPanelSchema,
} from "@/contracts/module-manifest";
import type { PermissionDefinition } from "@/contracts/permissions";
import { db } from "@/platform/db";
import type { z } from "zod";

import { coreManifest } from "./core-manifest";
import { moduleManifests } from "./generated";
import { CORE_MODULE_ID, validateManifests } from "./validate";

/**
 * The module registry (docs/contracts/module-manifest.md §3): the core manifest plus every module
 * manifest codegen found. Manifests are validated once, on first use.
 */

let validated: ModuleManifest[] | null = null;

/** Every manifest, the core first, validated (throws on an invalid manifest). */
export function getAllModules(): ModuleManifest[] {
  if (validated === null) {
    const all = [coreManifest, ...moduleManifests];
    const errors = validateManifests(all);
    if (errors.length > 0) throw new Error(`Invalid module manifests:\n- ${errors.join("\n- ")}`);
    validated = all;
  }
  return validated;
}

/** Reads the PLATFORM-scope settings `module.<id>.enabled` for the given keys. */
export type EnabledSettingsReader = (
  keys: readonly string[],
) => Promise<ReadonlyMap<string, unknown>>;

const readEnabledSettings: EnabledSettingsReader = async (keys) => {
  const rows = await db.setting.findMany({
    where: { scope: "PLATFORM", userId: null, key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  return new Map(rows.map((row) => [row.key, row.value]));
};

/**
 * Modules that are on: the manifest's `enabled`, overridden by the setting `module.<id>.enabled`
 * when it holds a boolean (rule 4). The platform core is always on.
 */
export async function getEnabledModules(
  options: { readSettings?: EnabledSettingsReader } = {},
): Promise<ModuleManifest[]> {
  const all = getAllModules();
  const keys = all
    .filter((module) => module.id !== CORE_MODULE_ID)
    .map((module) => `module.${module.id}.enabled`);
  const settings = await (options.readSettings ?? readEnabledSettings)(keys);
  return all.filter((module) => {
    if (module.id === CORE_MODULE_ID) return true;
    const override = settings.get(`module.${module.id}.enabled`);
    return typeof override === "boolean" ? override : module.enabled;
  });
}

/** What getNavigation needs from the current user: Phase 3's can(), bound to the session. */
export interface NavigationUser {
  /** The user's id, so sections scoped to their own records (OWN) show for them. */
  id?: string;
  can: (action: string, resource?: object) => boolean;
}

/**
 * Whether the user may open a page for `action` on `resource`: allowed outright, or allowed on
 * their own records (an OWN or OWN+A scope, where the page then lists only what they own). Phase 4
 * can gate widgets and commands with the same rule.
 */
export function mayOpen(user: NavigationUser, action: string, resource: object = {}): boolean {
  if (user.can(action, resource)) return true;
  return user.id !== undefined && user.can(action, { ...resource, ownerId: user.id });
}

/**
 * Whether the user may see an item. An item without a resource whose action is line-scoped (for
 * example Overview's `acquisition.overview.read`, LINES for a SERVICE_LEAD or MEMBER) is shown
 * when the action is allowed for at least one service line: the page then filters by line
 * (platform.md AC-8.1, "Overview filtered to their lines"). A section scoped to the user's own
 * records (a MEMBER's Review and Inbox) shows too.
 */
function mayView(item: NavItem, user: NavigationUser): boolean {
  if (item.permission === undefined) return true;
  const action = item.permission;
  if (item.resource !== undefined) return mayOpen(user, action, item.resource);
  return (
    mayOpen(user, action) ||
    Object.values(ServiceLine).some((serviceLine) => mayOpen(user, action, { serviceLine }))
  );
}

function visibleItems(items: readonly NavItem[], user: NavigationUser): NavItem[] {
  const visible: NavItem[] = [];
  for (const item of items) {
    if (!mayView(item, user)) continue;
    if (item.children === undefined) {
      visible.push(item);
      continue;
    }
    // A parent with no visible children is removed too (rule 5).
    const children = visibleItems(item.children, user);
    if (children.length > 0) visible.push({ ...item, children });
  }
  return visible;
}

/**
 * The navigation tree of every enabled module, filtered by the user's permissions: items the user
 * can't access are removed, and so is a parent left with no children. Plain data only.
 */
export async function getNavigation(
  user: NavigationUser,
  options: { modules?: readonly ModuleManifest[] } = {},
): Promise<{ module: string; items: NavItem[] }[]> {
  const modules = options.modules ?? (await getEnabledModules());
  return modules
    .map((module) => ({ module: module.id, items: visibleItems(module.navigation, user) }))
    .filter((entry) => entry.items.length > 0);
}

/** Core actions plus every module's actions (Phase 3 builds the permission matrix from these). */
export function getAllPermissions(): PermissionDefinition[] {
  return getAllModules().flatMap((module) => module.permissions);
}

// The getters below cover every module by default; pass `await getEnabledModules()` to limit them
// to enabled modules (a disabled module's widgets, commands and schedules disappear, rule 4).

export function getAllJobs(
  modules: readonly ModuleManifest[] = getAllModules(),
): AnyJobDefinition[] {
  return modules.flatMap((module) => module.jobs);
}

export function getCronSchedules(
  modules: readonly ModuleManifest[] = getAllModules(),
): (CronSchedule & { module: string })[] {
  return modules.flatMap((module) =>
    module.schedules.map((schedule) => ({ ...schedule, module: module.id })),
  );
}

export function getDynamicScheduleProviders(
  modules: readonly ModuleManifest[] = getAllModules(),
): { module: string; provider: DynamicScheduleProvider }[] {
  return modules.flatMap((module) =>
    module.dynamicSchedules === undefined
      ? []
      : [{ module: module.id, provider: module.dynamicSchedules }],
  );
}

export function getSettingDefinitions(
  modules: readonly ModuleManifest[] = getAllModules(),
): SettingDefinition[] {
  return modules.flatMap((module) => module.settings);
}

export function getSettingsPanels(
  modules: readonly ModuleManifest[] = getAllModules(),
): (z.infer<typeof SettingsPanelSchema> & { module: string })[] {
  return modules.flatMap((module) =>
    module.settingsPanels.map((panel) => ({ ...panel, module: module.id })),
  );
}

/** Home widgets, in their `order`. */
export function getHomeWidgets(
  modules: readonly ModuleManifest[] = getAllModules(),
): (z.infer<typeof HomeWidgetSchema> & { module: string })[] {
  return modules
    .flatMap((module) => module.homeWidgets.map((widget) => ({ ...widget, module: module.id })))
    .sort((a, b) => a.order - b.order);
}

export function getNotificationTypes(
  modules: readonly ModuleManifest[] = getAllModules(),
): NotificationTypeDefinition[] {
  return modules.flatMap((module) => module.notificationTypes);
}

export function getCommands(
  modules: readonly ModuleManifest[] = getAllModules(),
): (z.infer<typeof CommandDefinitionSchema> & { module: string })[] {
  return modules.flatMap((module) =>
    module.commands.map((command) => ({ ...command, module: module.id })),
  );
}

export function getAllAiTasks(
  modules: readonly ModuleManifest[] = getAllModules(),
): AnyTaskDefinition[] {
  return modules.flatMap((module) => module.aiTasks ?? []);
}

export function getAllSubscribers(
  modules: readonly ModuleManifest[] = getAllModules(),
): AnySubscriberDefinition[] {
  return modules.flatMap((module) => module.subscribers ?? []);
}

/**
 * A navigation badge's live count, from the resolver its module registered under the badge's
 * `source`. Null when no module registers that source yet (for example before Phase 19).
 */
export async function resolveBadge(
  source: string,
  ctx: { userId: string; clock: Clock },
): Promise<number | null> {
  for (const manifest of getAllModules()) {
    const resolver = manifest.badgeResolvers?.[source];
    if (resolver !== undefined) return resolver(ctx);
  }
  return null;
}
