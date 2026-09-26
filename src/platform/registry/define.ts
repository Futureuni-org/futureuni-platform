/**
 * Helpers every manifest uses (docs/contracts/module-manifest.md, jobs.md). Manifests import them
 * from "@/platform/registry/define", never from "@/platform/registry": the registry index imports
 * the generated manifest list, so importing it from a manifest would be an import cycle.
 */

import type { Role } from "@/contracts/common";
import type {
  AnySubscriberDefinition,
  DomainEvent,
  DomainEventName,
  EventOf,
  SubscriberDefinition,
} from "@/contracts/events";
import type { AnyJobDefinition, JobDefinition, JobHandler } from "@/contracts/jobs";
import type {
  DefineModule,
  DefineSetting,
  ModuleManifest,
  SettingDefinition,
} from "@/contracts/module-manifest";
import type {
  PermissionAction,
  PermissionDefinition,
  PermissionScope,
} from "@/contracts/permissions";

/** Declares a module manifest (the default export of src/modules/<id>/manifest.ts). */
export const defineModule: DefineModule = (manifest: ModuleManifest) => manifest;

/**
 * Declares a job and erases its input type for the manifest's `jobs` array (jobs contract, rule
 * 14). A single handler and the idempotency key always receive input parsed with the job's own
 * schema. A workflow handler is kept exactly as written: the Workflow build tags the "use workflow"
 * function and start() needs that reference; the platform parses its input at enqueue (rule 10).
 */
export function defineJob<TInput>(def: JobDefinition<TInput>): AnyJobDefinition {
  const parse = (input: unknown): TInput => def.input.parse(input);
  const typed = def.handler;
  const handler: JobHandler<unknown> =
    typed.kind === "single"
      ? { kind: "single", run: async (input, ctx) => typed.run(parse(input), ctx) }
      : typed;
  return {
    ...def,
    input: def.input,
    handler,
    idempotencyKey: (input) => def.idempotencyKey(parse(input)),
  };
}

/**
 * Declares an event subscriber and erases its event type for the manifest's `subscribers` array.
 * The erased handler checks the event's name before calling the typed one, so a subscriber never
 * receives an event it didn't subscribe to.
 */
export function defineSubscriber<N extends DomainEventName>(
  def: SubscriberDefinition<N>,
): AnySubscriberDefinition {
  const names: readonly DomainEventName[] = def.events;
  const handles = (event: DomainEvent): event is EventOf<N> => names.includes(event.name);
  return {
    ...def,
    events: names,
    handler: async (event, ctx) => {
      if (!handles(event)) {
        throw new Error(
          `Subscriber "${def.id}" received "${event.name}", which it doesn't subscribe to.`,
        );
      }
      await def.handler(event, ctx);
    },
  };
}

/** Declares a setting and erases its value type. The default must satisfy the schema. */
export const defineSetting: DefineSetting = <T>(def: SettingDefinition<T>): SettingDefinition => {
  const parsed = def.schema.safeParse(def.default);
  if (!parsed.success)
    throw new Error(`Setting "${def.key}": its default doesn't match its schema.`);
  return { ...def, schema: def.schema, default: def.default };
};

/** A matrix row's scopes in the table's column order: ADMIN, MANAGER, SERVICE_LEAD, MEMBER. */
export function scopes(
  admin: PermissionScope,
  manager: PermissionScope,
  serviceLead: PermissionScope,
  member: PermissionScope,
): Record<Role, PermissionScope> {
  return { ADMIN: admin, MANAGER: manager, SERVICE_LEAD: serviceLead, MEMBER: member };
}

type ResourceField = PermissionDefinition["resourceFields"][number];

/** The resource fields each scope needs (permissions contract: a missing field means deny). */
const SCOPE_FIELDS: Readonly<Record<PermissionScope, readonly ResourceField[]>> = {
  ALL: [],
  LINES: ["serviceLine"],
  OWN: ["serviceLine", "ownerId"],
  "OWN+A": ["serviceLine", "ownerId"],
  SELF: ["userId"],
  CEIL: ["targetRole"],
  NONE: [],
};

/**
 * One permission-matrix row, with the resource fields derived from its scopes. The scopes are the
 * .claude/project-rules.md matrix values; "—" is NONE.
 */
export function permission(
  action: PermissionAction,
  label: string,
  scopes: Record<Role, PermissionScope>,
  description?: string,
): PermissionDefinition {
  const fields = new Set<ResourceField>();
  for (const scope of Object.values(scopes))
    for (const field of SCOPE_FIELDS[scope]) fields.add(field);
  return {
    action,
    label,
    scopes,
    resourceFields: [...fields],
    ...(description === undefined ? {} : { description }),
  };
}
