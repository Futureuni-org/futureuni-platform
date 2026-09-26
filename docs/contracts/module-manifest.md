# Contract: Module manifest and registry

| | |
|---|---|
| Module | `src/contracts/module-manifest.ts` |
| Types written by | Phase 2 |
| Registry implemented by | Phase 2 (`src/platform/registry/`: `codegen.ts`, `generated.ts`, `registry.ts`, `core-manifest.ts`) |
| Manifests | Core: `src/platform/registry/core-manifest.ts` (Phase 2, later additions via requests). Client Acquisition: `src/modules/acquisition/manifest.ts` (initial version Phase 2, owned by Phase 19). Future modules: `pnpm create-module` |
| Consumers | Phase 3 (`getAllPermissions`), 4 (shell navigation, home widgets, command palette), 5 (AI task registration), 6 (jobs, schedules, subscribers, settings, notification types), 18 (settings panels, module toggle), 19 (final manifest) |

## 1. Purpose

A module is a folder, `src/modules/<id>/`, plus one manifest that declares everything the platform needs to host it: navigation, permissions, jobs, schedules, settings, home widgets, notification types, AI tasks, commands and event subscribers. Adding a module never touches the platform core (ADR-002).

## 2. Types and schemas

```ts
// src/contracts/module-manifest.ts
import { z } from "zod";
import { KebabIdSchema, ServiceLineSchema, SettingScopeSchema, NotificationChannelSchema, type Clock } from "./common";
import { PermissionActionSchema, PermissionDefinitionSchema } from "./permissions";
import { CronScheduleSchema, JobDefinitionMetaSchema, type AnyJobDefinition, type DynamicScheduleProvider } from "./jobs";
import type { AnyTaskDefinition } from "./ai-service";
import type { AnySubscriberDefinition } from "./events";

/** Lucide icon component name, e.g. "Globe", "PenTool". The shell maps names to components; unknown names fail codegen. */
export const IconNameSchema = z.string().regex(/^[A-Z][A-Za-z0-9]+$/);

/** Live count shown next to a nav item. Resolved server-side by the registry's badge resolver map. */
export const NavBadgeSchema = z.object({
  source: z.string().regex(/^[a-z]+\.[a-zA-Z0-9.-]+$/),   // e.g. "acquisition.review-count"; resolver registered by the module
  tone: z.enum(["neutral", "attention", "danger"]).default("neutral"),
});

/** Optional fields are declared `?: T | undefined` so the annotated Zod schema below type-checks under `exactOptionalPropertyTypes` (Phase 1 tsconfig). */
export type NavItem = {
  id: string;                                // unique within the manifest, e.g. "web-development.review"
  label: string;                             // sentence case
  href: string;                              // must start with the module's routePrefix
  icon?: string | undefined;
  permission?: string | undefined;           // PermissionAction; hidden when can() is false
  resource?: { serviceLine?: z.infer<typeof ServiceLineSchema> | undefined } | undefined;   // passed to can() for line-scoped tabs
  badge?: z.infer<typeof NavBadgeSchema> | undefined;
  children?: NavItem[] | undefined;          // max depth 3
};
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
export type SettingDefinition<T = unknown> = {
  key: string;                               // "module.acquisition.enabled", "acquisition.unsubscribeScope", "jobs.<name>.enabled"
  scope: z.infer<typeof SettingScopeSchema>; // PLATFORM | MODULE | USER
  schema: z.ZodType<T>;
  default: T;
  label: string;
  description: string;
  sensitive: false;                          // literal: credentials live in the vault, never in settings
  requiredPermission: string;                // PermissionAction to edit, e.g. "platform.setting.update"
  group?: string;                            // UI grouping inside a settings panel
};
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
  href: z.string().startsWith("/"),         // e.g. "/admin/platform" or "/acquisition/[line]/settings?section=overview"
  permission: PermissionActionSchema,
  settingKeys: z.array(z.string()).default([]),
});

export const HomeWidgetSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z0-9-]+$/),   // e.g. "acquisition.my-review-queue"
  title: z.string().max(60),
  description: z.string().max(200).optional(),
  permission: PermissionActionSchema,
  size: z.enum(["sm", "md", "lg"]).default("md"),
  order: z.int().min(0).max(1000).default(100),
});

export const NotificationTypeDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z]+(\.[a-z0-9-]+)+$/),   // e.g. "reply.interested"
  label: z.string().max(80),
  description: z.string().max(280),
  category: z.enum(["transactional", "product"]),      // no marketing category on this platform
  defaultChannels: z.array(NotificationChannelSchema).min(1),
  critical: z.boolean().default(false),               // critical types can't be muted
  digestible: z.boolean().default(true),              // may be batched into the daily digest
});
export type NotificationTypeDefinition = z.infer<typeof NotificationTypeDefinitionSchema>;

/** Serializable command for the palette. Client-side `perform` behaviour is registered by the module's UI via registerCommand (Phase 4). */
export const CommandDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/),
  label: z.string().max(80),                  // "Go to Web Development › Review"
  group: z.enum(["navigate", "actions"]),
  href: z.string().startsWith("/").optional(),
  permission: PermissionActionSchema.optional(),
  resource: z.object({ serviceLine: ServiceLineSchema.optional() }).optional(),
  shortcut: z.string().max(20).optional(),
});

/** The serializable part, validated at codegen and at startup. */
export const ModuleManifestMetaSchema = z.object({
  id: KebabIdSchema,                          // "acquisition"; "platform" is reserved for the core manifest
  name: z.string().min(2).max(40),            // "Client Acquisition"
  description: z.string().max(280),
  icon: IconNameSchema,
  routePrefix: z.string().regex(/^\/[a-z0-9-]+$/),   // "/acquisition"; the core manifest uses "/"
  order: z.int().min(0).max(1000).default(100),      // module switcher order
  enabled: z.boolean().default(true),                // overridden by setting "module.<id>.enabled"
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
export type DefineSetting = <T>(def: SettingDefinition<T>) => SettingDefinition<unknown>;

export interface ModuleManifest extends Omit<ModuleManifestMeta, "jobs" | "settings"> {
  jobs: AnyJobDefinition[];                   // every entry built with defineJob()
  settings: SettingDefinition<unknown>[];     // every entry built with defineSetting()
  dynamicSchedules?: DynamicScheduleProvider;
  aiTasks?: AnyTaskDefinition[];              // built with defineTask(); registered with @/platform/ai at startup (or via tasks.ts codegen; Phase 5 decides)
  subscribers?: AnySubscriberDefinition[];                 // every entry built with defineSubscriber()
  badgeResolvers?: Record<string, (ctx: { userId: string; clock: Clock }) => Promise<number>>;
}

/** Helper every manifest uses so literal types are kept and the file type-checks. Implemented in src/platform/registry. */
export type DefineModule = (manifest: ModuleManifest) => ModuleManifest;
```

> Note for Phase 2: `defineJob<T>()` (typed in `jobs.md`) and `defineSetting<T>()` are the only places a typed definition is widened to `unknown`. The widening is one documented, type-safe wrapper: it validates `input` with the job's own schema before calling the handler. The `any` ban holds everywhere (project-rules §Bans).

## 3. Registry API (Phase 2, `src/platform/registry/registry.ts`)

```ts
export type RegistryApi = {
  getAllModules(): ModuleManifest[];                         // validated with ModuleManifestMetaSchema
  getEnabledModules(): Promise<ModuleManifest[]>;            // manifest.enabled, overridden by setting module.<id>.enabled
  getNavigation(user: { can: (action: string, resource?: object) => boolean }): Promise<Array<{ module: string; items: NavItem[] }>>;
  getAllPermissions(): PermissionDefinition[];               // core + every module
  getAllJobs(): AnyJobDefinition[];
  getCronSchedules(): Array<CronSchedule & { module: string }>;
  getDynamicScheduleProviders(): Array<{ module: string; provider: DynamicScheduleProvider }>;
  getSettingDefinitions(): SettingDefinition<unknown>[];
  getSettingsPanels(): Array<z.infer<typeof SettingsPanelSchema> & { module: string }>;
  getHomeWidgets(): Array<z.infer<typeof HomeWidgetSchema> & { module: string }>;
  getNotificationTypes(): NotificationTypeDefinition[];
  getCommands(): Array<z.infer<typeof CommandDefinitionSchema> & { module: string }>;
  getAllAiTasks(): AnyTaskDefinition[];
  getAllSubscribers(): AnySubscriberDefinition[];
};
```

## 4. Rules

1. **Discovery by code generation.** Next.js can't glob at runtime, so `pnpm registry:gen` (`src/platform/registry/codegen.ts`) finds every `src/modules/*/manifest.ts` and writes `src/platform/registry/generated.ts`. That file imports each manifest statically, sorted by module ID, and is committed. It runs before `dev`, `build`, `typecheck` and `test`, and CI fails when it's stale.
2. **Codegen validation** fails with a clear message on:
   - a duplicate module ID (including `platform`)
   - overlapping route prefixes
   - a module prefix equal to a core path (`/`, `/settings`, `/admin`, `/dev`, `/login`, `/invite`, `/reset`, `/setup-2fa`, `/signed-out`, `/u`, `/api`)
   - duplicate permission actions
   - duplicate job names or schedule IDs
   - an invalid cron expression or timezone
   - a schedule whose `job` isn't declared
   - a navigation `href` outside the module's `routePrefix`
   - an unknown icon name
   - a duplicate setting key, notification type or widget ID
   - a permission referenced by navigation, widgets, panels or commands that isn't registered
3. **The core manifest** has `id: "platform"`, `routePrefix: "/"`, and is exempt from the prefix-overlap check.
   - Its navigation is Home, Settings, and Admin. Admin requires `platform.admin.access`, so only `ADMIN` and `MANAGER` see it. The admin frame then hides individual sections per the matrix (each section has its own action).
   - Deviation from Phase 2's prompt ("Admin visible to ADMIN only"): `MANAGER` also sees Admin, because Phase 18 gives managers the jobs, team and other read-only sections. `SERVICE_LEAD` and `MEMBER` never see `/admin`.
   - Its permissions are every `platform.*` action in the matrix.
   - Its jobs are the platform jobs (added by the Wave 1 integration).
4. **Enablement.** `getEnabledModules()` uses `manifest.enabled`, overridden by the setting `module.<id>.enabled`. A disabled module disappears from navigation, home widgets, commands and schedules. Its routes return `NOT_FOUND`.
5. **Shell rendering (Phase 4).**
   - The shell calls `getEnabledModules()` for the module switcher, and `getNavigation()` with a server-side `can` bound to the session.
   - Only filtered, plain data (no functions, no permission logic) reaches client components.
   - Items the user can't access are removed, and a parent with no visible children is removed too.
   - Badges are resolved server-side and streamed.
6. **Acquisition navigation** follows the route map (`docs/specs/module-acquisition.md` §6, identical to `docs/prompts/wave-4/wave-4-prep-and-merge.md` B1): an Overview item, then four line tabs, each with **Search, Review, Leads, Pipeline, Inbox, Analytics and Settings** children, gated by line-scoped permissions.
   - Deviation from the Phase 2 and Phase 15 prompts: **Leads** is added as a section, because `/acquisition/[line]/leads` already exists in the wave-4 route map and Phase 19 checks navigation against §6.
   - A **line tab** is gated by `acquisition.lead.read` with `resource.serviceLine`. So a `SERVICE_LEAD` sees every tab (read-only outside their lines, with action controls hidden and server actions refusing), and a `MEMBER` sees only their own lines. Each section child is gated by its own action. For example, Search is gated by `acquisition.search.read`, so members can open it for manual add; the Run button itself needs `acquisition.search.run`.
7. **Registration exports** (wave guides, Part B3). Areas export `jobs.ts`, `settings.ts`, `tasks.ts`, `schedules.ts` and `notifications.ts` from their own folders. Only the manifest owner (the Phase 2 initial version, Phase 19 afterwards, and the integration sessions on `main`) adds them to `manifest.ts`.
8. **Settings** are declared once, in the manifest that owns them. Platform keys (`platform.*`, `auth.*`, `ai.*`, `module.*`, `jobs.*`, `notifications.*`, `user.*`) belong to the core manifest.
9. **Home widgets** render inside the Phase 4 widget frame. A widget ID maps to a component through a widget registry that Phase 4 creates. Phase 4 renders the acquisition placeholders from its own folders. The real acquisition widget components live in `src/modules/acquisition/ui/widgets/` (owned by Phase 19), which registers them.
10. **`create-module`** generates a manifest that already passes this schema (Phase 2, `templates/create-module/`).
11. **Module ids.** A module id is 2–32 lower-case letters (for example `marketing`), and isn't `platform` or a reserved route segment (`home`, `settings`, `admin`, `dev`, `login`, `invite`, `reset`, `setup-2fa`, `signed-out`, `u`, `api`). It becomes the first segment of the module's permissions, jobs, AI tasks and events. `pnpm create-module` enforces it.
12. **Navigation for line-scoped and own-record sections.** An item with a line-scoped permission and no `resource` shows when the action is allowed for at least one service line; the page then filters by the user's lines (platform.md AC-8.1). An item whose action is scoped to the user's own records (OWN, OWN+A) shows too; the page lists only what they own. `getNavigation` and `mayOpen` implement both.

## 5. Worked example (acquisition manifest excerpt)

```ts
export default defineModule({
  id: "acquisition",
  name: "Client Acquisition",
  description: "Find, audit, contact and win clients for every FUTUREUNI service line.",
  icon: "Radar",
  routePrefix: "/acquisition",
  order: 10,
  enabled: true,
  navigation: [
    { id: "overview", label: "Overview", href: "/acquisition/overview", icon: "LayoutDashboard", permission: "acquisition.overview.read" },
    {
      id: "web-development", label: "Web Development", href: "/acquisition/web-development", icon: "Globe",
      permission: "acquisition.lead.read", resource: { serviceLine: "WEB_DEVELOPMENT" },
      children: [
        { id: "web-development.search", label: "Search", href: "/acquisition/web-development/search", permission: "acquisition.search.read", resource: { serviceLine: "WEB_DEVELOPMENT" } },
        { id: "web-development.review", label: "Review", href: "/acquisition/web-development/review", permission: "acquisition.review.read", resource: { serviceLine: "WEB_DEVELOPMENT" }, badge: { source: "acquisition.review-count", tone: "attention" } },
        { id: "web-development.leads", label: "Leads", href: "/acquisition/web-development/leads", permission: "acquisition.lead.read", resource: { serviceLine: "WEB_DEVELOPMENT" } },
        // … Pipeline, Inbox, Analytics, Settings follow the same pattern
      ],
    },
  ],
  permissions: [
    { action: "acquisition.message.approve", label: "Approve outreach messages",
      scopes: { ADMIN: "ALL", MANAGER: "ALL", SERVICE_LEAD: "LINES", MEMBER: "OWN+A" }, resourceFields: ["serviceLine", "ownerId"] },
  ],
  jobs: [], schedules: [], settings: [], settingsPanels: [],
  homeWidgets: [
    { id: "acquisition.my-review-queue", title: "My review queue", permission: "acquisition.review.read", size: "md", order: 10 },
    { id: "acquisition.my-inbox", title: "My inbox", permission: "acquisition.inbox.read", size: "md", order: 20 },
    { id: "acquisition.pipeline-value", title: "Pipeline value", permission: "acquisition.pipeline.read", size: "md", order: 30 },
  ],
  notificationTypes: [], commands: [],
});
```

## 6. Invalid example (Phase 2 codegen test)

```ts
ModuleManifestMetaSchema.parse({ ...validAcquisition,
  navigation: [{ id: "oops", label: "Leads", href: "/leads" }] });
// Schema passes (href is a valid path), but codegen validation fails:
// "Module 'acquisition': navigation item 'oops' links to '/leads', outside its routePrefix '/acquisition'."
ModuleManifestMetaSchema.safeParse({ ...validAcquisition, routePrefix: "acquisition" });
// → fails: ["routePrefix"] must start with "/" (regex)
```
