/**
 * Contract: module manifest and registry (docs/contracts/module-manifest.md). A module is a
 * folder plus one manifest declaring navigation, permissions, jobs, schedules, settings, widgets,
 * notification types, AI tasks, commands and subscribers. Implemented by Phase 2's registry.
 */

import { z } from "zod";

import type { AnyTaskDefinition } from "./ai-service";
import {
  KebabIdSchema,
  NotificationChannelSchema,
  ServiceLineSchema,
  SettingScopeSchema,
  type Clock,
} from "./common";
import type { AnySubscriberDefinition } from "./events";
import {
  CronScheduleSchema,
  JobDefinitionMetaSchema,
  type AnyJobDefinition,
  type CronSchedule,
  type DynamicScheduleProvider,
} from "./jobs";
import {
  PermissionActionSchema,
  PermissionDefinitionSchema,
  type PermissionDefinition,
} from "./permissions";

/** Lucide icon component name, e.g. "Globe", "PenTool". The shell maps names to components; unknown names fail codegen. */
export const IconNameSchema = z.string().regex(/^[A-Z][A-Za-z0-9]+$/);

/** Live count shown next to a nav item. Resolved server-side by the registry's badge resolver map. */
export const NavBadgeSchema = z.object({
  source: z.string().regex(/^[a-z]+\.[a-zA-Z0-9.-]+$/), // e.g. "acquisition.review-count"; resolver registered by the module
  tone: z.enum(["neutral", "attention", "danger"]).default("neutral"),
});

/** Optional fields are declared `?: T | undefined` so the annotated Zod schema below type-checks under `exactOptionalPropertyTypes` (Phase 1 tsconfig). */
export interface NavItem {
  id: string; // unique within the manifest, e.g. "web-development.review"
  label: string; // sentence case
  href: string; // must start with the module's routePrefix
  icon?: string | undefined;
  permission?: string | undefined; // PermissionAction; hidden when can() is false
  resource?: { serviceLine?: z.infer<typeof ServiceLineSchema> | undefined } | undefined; // passed to can() for line-scoped tabs
  badge?: z.infer<typeof NavBadgeSchema> | undefined;
  children?: NavItem[] | undefined; // max depth 3
}
export const NavItemSchema: z.ZodType<NavItem> = z.lazy(() =>
  z.object({
    id: z.string().regex(/^[a-z0-9.-]+$/),
    label: z.string().min(1).max(40),
    href: z.string().regex(/^\/[a-z0-9\-/[\]?=&._]*$/),
    icon: IconNameSchema.optional(),
    permission: PermissionActionSchema.optional(),
    resource: z.object({ serviceLine: ServiceLineSchema.optional() }).optional(),
    badge: NavBadgeSchema.optional(),
    children: z.array(NavItemSchema).max(12).optional(),
  }),
);

/** A typed setting. Values are validated with `schema` on every write (Phase 6 settings store). Secrets never go here. */
export interface SettingDefinition<T = unknown> {
  key: string; // "module.acquisition.enabled", "acquisition.unsubscribeScope", "jobs.<name>.enabled"
  scope: z.infer<typeof SettingScopeSchema>; // PLATFORM | MODULE | USER
  schema: z.ZodType<T>;
  default: T;
  label: string;
  description: string;
  sensitive: false; // literal: credentials live in the vault, never in settings
  requiredPermission: string; // PermissionAction to edit, e.g. "platform.setting.update"
  group?: string; // UI grouping inside a settings panel
}
export const SettingDefinitionMetaSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9<>-]+)+$/),
  scope: SettingScopeSchema,
  label: z.string().min(2).max(80),
  description: z.string().min(5).max(400),
  sensitive: z.literal(false),
  requiredPermission: PermissionActionSchema,
  group: z.string().max(40).optional(),
});

export const SettingsPanelSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/),
  label: z.string().max(60),
  href: z.string().startsWith("/"), // e.g. "/admin/platform" or "/acquisition/[line]/settings?section=overview"
  permission: PermissionActionSchema,
  settingKeys: z.array(z.string()).default([]),
});

export const HomeWidgetSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z0-9-]+$/), // e.g. "acquisition.my-review-queue"
  title: z.string().max(60),
  description: z.string().max(200).optional(),
  permission: PermissionActionSchema,
  size: z.enum(["sm", "md", "lg"]).default("md"),
  order: z.int().min(0).max(1000).default(100),
});

export const NotificationTypeDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z]+(\.[a-z0-9-]+)+$/), // e.g. "reply.interested"
  label: z.string().max(80),
  description: z.string().max(280),
  category: z.enum(["transactional", "product"]), // no marketing category on this platform
  defaultChannels: z.array(NotificationChannelSchema).min(1),
  critical: z.boolean().default(false), // critical types can't be muted
  digestible: z.boolean().default(true), // may be batched into the daily digest
});
export type NotificationTypeDefinition = z.infer<typeof NotificationTypeDefinitionSchema>;

/** Serializable command for the palette. Client-side `perform` behaviour is registered by the module's UI via registerCommand (Phase 4). */
export const CommandDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/),
  label: z.string().max(80), // "Go to Web Development › Review"
  group: z.enum(["navigate", "actions"]),
  href: z.string().startsWith("/").optional(),
  permission: PermissionActionSchema.optional(),
  resource: z.object({ serviceLine: ServiceLineSchema.optional() }).optional(),
  shortcut: z.string().max(20).optional(),
});

/** The serializable part, validated at codegen and at startup. */
export const ModuleManifestMetaSchema = z.object({
  id: KebabIdSchema, // "acquisition"; "platform" is reserved for the core manifest
  name: z.string().min(2).max(40), // "Client Acquisition"
  description: z.string().max(280),
  icon: IconNameSchema,
  routePrefix: z.string().regex(/^\/[a-z0-9-]+$/), // "/acquisition"; the core manifest uses "/" (checked separately by the registry)
  order: z.int().min(0).max(1000).default(100), // module switcher order
  enabled: z.boolean().default(true), // overridden by setting "module.<id>.enabled"
  navigation: z.array(NavItemSchema).max(20),
  permissions: z.array(PermissionDefinitionSchema),
  jobs: z.array(JobDefinitionMetaSchema).default([]),
  schedules: z.array(CronScheduleSchema).default([]),
  settings: z.array(SettingDefinitionMetaSchema).default([]),
  settingsPanels: z.array(SettingsPanelSchema).default([]),
  homeWidgets: z.array(HomeWidgetSchema).default([]),
  notificationTypes: z.array(NotificationTypeDefinitionSchema).default([]),
  commands: z.array(CommandDefinitionSchema).default([]),
});
export type ModuleManifestMeta = z.infer<typeof ModuleManifestMetaSchema>;

/** What a module's manifest.ts default-exports. Behaviour (functions, Zod schemas) sits beside the metadata. */
/** AnyJobDefinition and defineJob<T>() are defined in docs/contracts/jobs.md. Settings follow the same pattern. */
export type DefineSetting = <T>(def: SettingDefinition<T>) => SettingDefinition;

export interface ModuleManifest extends Omit<ModuleManifestMeta, "jobs" | "settings"> {
  jobs: AnyJobDefinition[]; // every entry built with defineJob()
  settings: SettingDefinition[]; // every entry built with defineSetting()
  dynamicSchedules?: DynamicScheduleProvider;
  aiTasks?: AnyTaskDefinition[]; // built with defineTask(); registered with @/platform/ai at startup (or via tasks.ts codegen; Phase 5 decides)
  subscribers?: AnySubscriberDefinition[]; // every entry built with defineSubscriber()
  badgeResolvers?: Record<string, (ctx: { userId: string; clock: Clock }) => Promise<number>>;
}

/** Helper every manifest uses so literal types are kept and the file type-checks. Implemented in src/platform/registry. */
export type DefineModule = (manifest: ModuleManifest) => ModuleManifest;

// ---- Registry API (Phase 2, src/platform/registry/registry.ts; contract §3) ----
export interface RegistryApi {
  getAllModules(): ModuleManifest[]; // validated with ModuleManifestMetaSchema
  getEnabledModules(): Promise<ModuleManifest[]>; // manifest.enabled, overridden by setting module.<id>.enabled
  getNavigation(user: {
    can: (action: string, resource?: object) => boolean;
  }): Promise<{ module: string; items: NavItem[] }[]>;
  getAllPermissions(): PermissionDefinition[]; // core + every module
  getAllJobs(): AnyJobDefinition[];
  getCronSchedules(): (CronSchedule & { module: string })[];
  getDynamicScheduleProviders(): { module: string; provider: DynamicScheduleProvider }[];
  getSettingDefinitions(): SettingDefinition[];
  getSettingsPanels(): (z.infer<typeof SettingsPanelSchema> & { module: string })[];
  getHomeWidgets(): (z.infer<typeof HomeWidgetSchema> & { module: string })[];
  getNotificationTypes(): NotificationTypeDefinition[];
  getCommands(): (z.infer<typeof CommandDefinitionSchema> & { module: string })[];
  getAllAiTasks(): AnyTaskDefinition[];
  getAllSubscribers(): AnySubscriberDefinition[];
}
