/**
 * Manifest validation (docs/contracts/module-manifest.md rule 2). Codegen runs it on every
 * manifest before writing generated.ts, and the registry runs it again at startup. Pure: it
 * returns plain-language errors, one per problem.
 */

import { Cron } from "croner";
import { z } from "zod";

import type { JobDefinitionMeta } from "@/contracts/jobs";
import {
  ModuleManifestMetaSchema,
  type ModuleManifest,
  type NavItem,
  type SettingDefinition,
} from "@/contracts/module-manifest";

/** The id of the platform's own manifest (core-manifest.ts); no module may use it. */
export const CORE_MODULE_ID = "platform";

/** Paths the platform core owns; a module prefix can't be one of them or sit under one. */
export const RESERVED_ROUTE_PREFIXES = [
  "/",
  "/home",
  "/settings",
  "/admin",
  "/dev",
  "/login",
  "/invite",
  "/reset",
  "/setup-2fa",
  "/signed-out",
  "/u",
  "/api",
] as const;

/** The core manifest has the prefix "/" and is exempt from the prefix rules. */
const CoreManifestMetaSchema = ModuleManifestMetaSchema.extend({
  id: z.literal(CORE_MODULE_ID),
  routePrefix: z.literal("/"),
});

/** The serialisable view of a job, as the registry validates and the admin screens list it. */
export function jobMeta(job: ModuleManifest["jobs"][number]): JobDefinitionMeta {
  return {
    name: job.name,
    description: job.description,
    handlerKind: job.handler.kind,
    steps: job.handler.kind === "workflow" ? [...job.handler.steps] : [],
    concurrency: job.concurrency,
    timeoutMs: job.timeoutMs,
    retry: job.retry,
    allowManualRun: job.allowManualRun ?? false,
    notifyOnFailure: job.notifyOnFailure ?? true,
    systemActions: [...(job.systemActions ?? [])],
  };
}

function settingMeta(setting: SettingDefinition) {
  return {
    key: setting.key,
    scope: setting.scope,
    label: setting.label,
    description: setting.description,
    sensitive: setting.sensitive,
    requiredPermission: setting.requiredPermission,
    ...(setting.group === undefined ? {} : { group: setting.group }),
  };
}

/** A manifest without its behaviour (functions, schemas), for ModuleManifestMetaSchema. */
export function manifestMeta(manifest: ModuleManifest): Record<string, unknown> {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    routePrefix: manifest.routePrefix,
    order: manifest.order,
    enabled: manifest.enabled,
    navigation: manifest.navigation,
    permissions: manifest.permissions,
    jobs: manifest.jobs.map(jobMeta),
    schedules: manifest.schedules,
    settings: manifest.settings.map(settingMeta),
    settingsPanels: manifest.settingsPanels,
    homeWidgets: manifest.homeWidgets,
    notificationTypes: manifest.notificationTypes,
    commands: manifest.commands,
  };
}

function flattenNavigation(
  items: readonly NavItem[],
  depth = 1,
): { item: NavItem; depth: number }[] {
  return items.flatMap((item) => [
    { item, depth },
    ...flattenNavigation(item.children ?? [], depth + 1),
  ]);
}

function isUnder(path: string, prefix: string): boolean {
  return (
    prefix === "/" ||
    path === prefix ||
    path.startsWith(`${prefix}/`) ||
    path.startsWith(`${prefix}?`)
  );
}

function validCron(expression: string, timezone: string): string | null {
  if (expression.trim().split(/\s+/).length !== 5)
    return "must have 5 fields (minute hour day month weekday)";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
  } catch {
    return `has an unknown timezone "${timezone}"`;
  }
  try {
    new Cron(expression, { timezone, paused: true }).stop();
  } catch (error) {
    return `is invalid (${error instanceof Error ? error.message : String(error)})`;
  }
  return null;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated];
}

export interface ValidateOptions {
  /** Lucide icon names; codegen passes the full set. Omitted at runtime (no icon check). */
  knownIcons?: ReadonlySet<string>;
}

/**
 * Validates manifests together. Returns every problem as a sentence naming the module, for
 * example "Module 'acquisition': navigation item 'oops' links to '/leads', outside its
 * routePrefix '/acquisition'." An empty array means they're valid.
 */
export function validateManifests(
  manifests: readonly ModuleManifest[],
  options: ValidateOptions = {},
): string[] {
  const errors: string[] = [];

  // Schema (contract types, lengths, patterns).
  for (const manifest of manifests) {
    const schema =
      manifest.id === CORE_MODULE_ID ? CoreManifestMetaSchema : ModuleManifestMetaSchema;
    const result = schema.safeParse(manifestMeta(manifest));
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(
          `Module '${manifest.id}': ${issue.path.join(".") || "(manifest)"}: ${issue.message}.`,
        );
      }
    }
  }

  // Module ids, including the reserved core id.
  for (const id of duplicates(manifests.map((manifest) => manifest.id))) {
    errors.push(
      id === CORE_MODULE_ID
        ? `Module id '${CORE_MODULE_ID}' is reserved for the platform core.`
        : `Module id '${id}' is used by more than one manifest.`,
    );
  }

  const modules = manifests.filter((manifest) => manifest.id !== CORE_MODULE_ID);

  // Route prefixes: no overlap between modules, and none on a core path.
  for (const manifest of modules) {
    const prefix = manifest.routePrefix;
    const reserved = RESERVED_ROUTE_PREFIXES.find((core) => core !== "/" && isUnder(prefix, core));
    if (prefix === "/" || reserved !== undefined) {
      errors.push(`Module '${manifest.id}': routePrefix '${prefix}' is a core path.`);
    }
  }
  for (const [index, a] of modules.entries()) {
    for (const b of modules.slice(index + 1)) {
      if (isUnder(a.routePrefix, b.routePrefix) || isUnder(b.routePrefix, a.routePrefix)) {
        errors.push(
          `Modules '${a.id}' and '${b.id}' have overlapping route prefixes ('${a.routePrefix}', '${b.routePrefix}').`,
        );
      }
    }
  }

  // Globally unique names.
  const actions = manifests.flatMap((manifest) =>
    manifest.permissions.map((permission) => permission.action),
  );
  for (const action of duplicates(actions))
    errors.push(`Permission action '${action}' is registered more than once.`);
  const jobNames = manifests.flatMap((manifest) => manifest.jobs.map((job) => job.name));
  for (const name of duplicates(jobNames)) errors.push(`Job '${name}' is declared more than once.`);
  const settingKeys = manifests.flatMap((manifest) =>
    manifest.settings.map((setting) => setting.key),
  );
  for (const key of duplicates(settingKeys))
    errors.push(`Setting '${key}' is declared more than once.`);
  const notificationTypes = manifests.flatMap((manifest) =>
    manifest.notificationTypes.map((type) => type.id),
  );
  for (const id of duplicates(notificationTypes))
    errors.push(`Notification type '${id}' is declared more than once.`);
  const widgets = manifests.flatMap((manifest) => manifest.homeWidgets.map((widget) => widget.id));
  for (const id of duplicates(widgets))
    errors.push(`Home widget '${id}' is declared more than once.`);

  const registeredActions = new Set(actions);
  const declaredJobs = new Set(jobNames);
  const jobsByName = new Map(
    manifests.flatMap((manifest) => manifest.jobs.map((job) => [job.name, job] as const)),
  );

  for (const manifest of manifests) {
    const where = `Module '${manifest.id}'`;
    const scheduleIds = manifest.schedules.map((schedule) => schedule.id);
    for (const id of duplicates(scheduleIds))
      errors.push(`${where}: schedule '${id}' is declared more than once.`);
    for (const schedule of manifest.schedules) {
      const cronError = validCron(schedule.cron, schedule.timezone);
      if (cronError !== null)
        errors.push(`${where}: schedule '${schedule.id}' cron '${schedule.cron}' ${cronError}.`);
      if (!declaredJobs.has(schedule.job)) {
        errors.push(
          `${where}: schedule '${schedule.id}' runs job '${schedule.job}', which no manifest declares.`,
        );
      } else if (
        jobsByName.get(schedule.job)?.input.safeParse(schedule.input ?? {}).success === false
      ) {
        errors.push(
          `${where}: schedule '${schedule.id}' has an input that job '${schedule.job}' would reject.`,
        );
      }
    }

    // Names carry their owner: a module's actions, jobs and settings start with its id; the core's
    // actions with "platform.", and its settings with "platform." or "module." (permissions.md rule 8).
    const prefixes =
      manifest.id === CORE_MODULE_ID ? ["platform.", "module."] : [`${manifest.id}.`];
    const owned = (name: string, allowed: readonly string[]) =>
      allowed.some((prefix) => name.startsWith(prefix));
    for (const permission of manifest.permissions) {
      const allowed = manifest.id === CORE_MODULE_ID ? ["platform."] : prefixes;
      if (!owned(permission.action, allowed))
        errors.push(
          `${where}: permission '${permission.action}' must start with '${allowed.join("' or '")}'.`,
        );
    }
    for (const job of manifest.jobs) {
      if (manifest.id !== CORE_MODULE_ID && !owned(job.name, prefixes))
        errors.push(`${where}: job '${job.name}' must start with '${manifest.id}.'.`);
    }
    for (const setting of manifest.settings) {
      if (!owned(setting.key, prefixes))
        errors.push(
          `${where}: setting '${setting.key}' must start with '${prefixes.join("' or '")}'.`,
        );
    }

    const nav = flattenNavigation(manifest.navigation);
    for (const id of duplicates(nav.map(({ item }) => item.id))) {
      errors.push(`${where}: navigation id '${id}' is used more than once.`);
    }
    for (const { item, depth } of nav) {
      if (depth > 3)
        errors.push(`${where}: navigation item '${item.id}' is nested deeper than 3 levels.`);
      if (manifest.id !== CORE_MODULE_ID && !isUnder(item.href, manifest.routePrefix)) {
        errors.push(
          `${where}: navigation item '${item.id}' links to '${item.href}', outside its routePrefix '${manifest.routePrefix}'.`,
        );
      }
      if (item.permission !== undefined && !registeredActions.has(item.permission)) {
        errors.push(
          `${where}: navigation item '${item.id}' needs '${item.permission}', which isn't a registered permission.`,
        );
      }
    }

    const references = [
      ...manifest.homeWidgets.map(
        (widget) => [`home widget '${widget.id}'`, widget.permission] as const,
      ),
      ...manifest.settingsPanels.map(
        (panel) => [`settings panel '${panel.id}'`, panel.permission] as const,
      ),
      ...manifest.commands.flatMap((command) =>
        command.permission === undefined
          ? []
          : [[`command '${command.id}'`, command.permission] as const],
      ),
      ...manifest.settings.map(
        (setting) => [`setting '${setting.key}'`, setting.requiredPermission] as const,
      ),
      // What a job or subscriber may do as the SYSTEM actor must be registered (permissions.md rule 10).
      ...manifest.jobs.flatMap((job) =>
        (job.systemActions ?? []).map(
          (action) => [`job '${job.name}' (systemActions)`, action] as const,
        ),
      ),
      ...(manifest.subscribers ?? []).flatMap((subscriber) =>
        (subscriber.systemActions ?? []).map(
          (action) => [`subscriber '${subscriber.id}' (systemActions)`, action] as const,
        ),
      ),
    ];
    for (const [what, action] of references) {
      if (!registeredActions.has(action))
        errors.push(`${where}: ${what} needs '${action}', which isn't a registered permission.`);
    }

    if (options.knownIcons !== undefined) {
      const icons = [
        manifest.icon,
        ...nav.flatMap(({ item }) => (item.icon === undefined ? [] : [item.icon])),
      ];
      for (const icon of icons) {
        if (!options.knownIcons.has(icon))
          errors.push(`${where}: unknown icon '${icon}' (use a lucide-react icon name).`);
      }
    }
  }
  return errors;
}
