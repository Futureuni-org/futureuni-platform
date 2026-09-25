# Contract: Permissions

| | |
|---|---|
| Module | `src/contracts/permissions.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 3 (`@/platform/auth`: `can`, `assertCan`, `assertActorCan`, `requirePermission`) |
| Registered by | Every module manifest (`permissions[]`), including the core manifest (`src/platform/registry/core-manifest.ts`) |
| Consumers | Every server action, route handler, service, page and the shell navigation filter |
| Rules source | The permission matrix in `.claude/project-rules.md` §"Roles and permissions". This contract defines the *shape*. The matrix defines the *values*. |

## 1. Purpose

One function answers "may this user do this action to this resource?": `can(user, action, resource?)`. Actions are data, registered by manifests with their scope per role. `can()` evaluates that data. Nobody writes role string comparisons (saas-auth).

## 2. Types and schemas

```ts
// src/contracts/permissions.ts
import { z } from "zod";
import { RoleSchema, ServiceLineSchema, MarketSchema, IdSchema, UserStatusSchema, type Role, type Actor } from "./common";
export { ActorSchema, type Actor } from "./common";

/** Naming: module.resource.verb, all camelCase segments. e.g. "acquisition.message.approve". */
export const PermissionActionSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/, { error: "Use module.resource.verb" });
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

/**
 * Scope codes (one per role per action):
 *  ALL    any resource
 *  LINES  resource.serviceLine ∈ user.serviceLines            (missing serviceLine → deny)
 *  OWN    resource.ownerId === user.id AND resource.serviceLine ∈ user.serviceLines
 *  OWN+A  OWN and user.canApprove === true
 *  SELF   resource.userId === user.id
 *  CEIL   the target role is at or below the actor's own role (ROLE_RANK), and never ADMIN
 *         (project-rules wording; ADMIN rows use ALL, so only non-admins are ever evaluated with CEIL)
 *  NONE   denied (shown as "—" in the project-rules matrix)
 */
export const PermissionScopeSchema = z.enum(["ALL", "LINES", "OWN", "OWN+A", "SELF", "CEIL", "NONE"]);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

/** Higher number = more privilege. Used by CEIL and by the invite/role-change rules. */
export const ROLE_RANK = { MEMBER: 1, SERVICE_LEAD: 2, MANAGER: 3, ADMIN: 4 } as const satisfies Record<Role, number>;

/** One row of the matrix, as a manifest registers it. All four roles are required (z.record with enum keys is exhaustive). */
export const PermissionDefinitionSchema = z.object({
  action: PermissionActionSchema,
  label: z.string().min(3).max(80),               // sentence case, e.g. "Approve outreach messages"
  description: z.string().max(280).optional(),
  scopes: z.record(RoleSchema, PermissionScopeSchema),
  /** Which resource fields the scope needs; drives the "missing field → deny" rule and the generated matrix test. */
  resourceFields: z.array(z.enum(["serviceLine", "ownerId", "userId", "targetRole", "market", "module"])).default([]),
});
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;

/** The resource a check is made against. Built on the server from the loaded record, never from client input. */
export const PermissionResourceSchema = z.object({
  module: z.string().optional(),
  serviceLine: ServiceLineSchema.optional(),
  ownerId: IdSchema.nullable().optional(),        // lead owner, meeting owner, handoff assignee…
  market: MarketSchema.optional(),
  userId: IdSchema.optional(),                    // for SELF-scoped actions
  targetRole: RoleSchema.optional(),              // for CEIL-scoped actions (invites, role changes)
});
export type PermissionResource = z.infer<typeof PermissionResourceSchema>;

/**
 * The subset of the current user that can() needs. Phase 3's CurrentUser satisfies it structurally:
 * CurrentUser has no `status` (a deactivated user has no session), so `status` is optional and missing means ACTIVE.
 */
export const PermissionSubjectSchema = z.object({
  id: IdSchema,
  role: RoleSchema,
  serviceLines: z.array(ServiceLineSchema),
  canApprove: z.boolean(),
  status: UserStatusSchema.optional(),
});
export type PermissionSubject = z.infer<typeof PermissionSubjectSchema>;

/** Implemented by Phase 3. Pure: no I/O. The registry's action list is injected at module load. */
export type Can = (user: PermissionSubject, action: PermissionAction, resource?: PermissionResource) => boolean;
/** Throws AppError("FORBIDDEN", 403). */
export type AssertCan = (user: PermissionSubject, action: PermissionAction, resource?: PermissionResource) => void;
/**
 * Actor-based check for services that receive an Actor rather than a session (SEAM-PERMISSION in Phases 5 and 6 has this shape).
 * USER actor: loads the user's role, status, TeamProfile.serviceLines and canApprove from the database, then applies can().
 * SYSTEM actor: allowed only when `actor.job` names a registered job or subscriber whose `systemActions` include the action.
 * Throws AppError("FORBIDDEN", 403) otherwise.
 */
export type AssertActorCan = (actor: Actor, action: PermissionAction, resource?: PermissionResource) => Promise<void>;
/** Explains a decision for UI tooltips and tests. Never sent to the client with internal detail beyond the reason text. */
export type PermissionDecision = { allowed: boolean; scope: PermissionScope; reason: "ALLOWED" | "UNREGISTERED_ACTION" | "ROLE_DENIED" | "MISSING_RESOURCE_FIELD" | "OUT_OF_LINE" | "NOT_OWNER" | "NEEDS_APPROVER_FLAG" | "NOT_SELF" | "ROLE_CEILING" | "USER_INACTIVE" };
export type ExplainCan = (user: PermissionSubject, action: PermissionAction, resource?: PermissionResource) => PermissionDecision;

/** The full matrix as data: the union of every manifest's permissions[]. Built by the registry (getAllPermissions()). */
export type PermissionMatrix = ReadonlyMap<PermissionAction, PermissionDefinition>;
```

## 3. Rules

1. **Deny by default.** An action that isn't registered by any manifest is always denied. In development, the denial logs a warning that names the action.
2. **The matrix is data.** `can()` looks up the action's `scopes[user.role]` and evaluates it. No code outside `@/platform/auth/permissions.ts` compares role strings.
3. **Scope semantics are exactly those in the `PermissionScope` comment.** For `LINES`, `OWN` and `OWN+A`, a missing `resource.serviceLine` means deny. For `OWN` and `OWN+A`, a missing or null `resource.ownerId` means deny. For `SELF`, a missing `resource.userId` means deny. For `CEIL`, a missing `resource.targetRole` means deny.
4. **`ALL` doesn't need a resource.** `can(user, "platform.home.read")` is valid.
5. **A `DEACTIVATED` user is denied everything**, even when a stale session somehow reaches a service.
6. **`CEIL` rules** (invites): the target role is at or below the actor's own role, and never `ADMIN` (project-rules wording). `ADMIN` rows use `ALL`, so only an `ADMIN` can invite or assign `ADMIN`. A MANAGER can invite `MANAGER`, `SERVICE_LEAD` and `MEMBER`.
7. **The resource is built on the server** from the loaded record (lead → `{ serviceLine, ownerId, market }`). IDs or scope fields from the request body are never trusted (saas-auth IDOR rules). A record the user can't read is reported as `NOT_FOUND`, not `FORBIDDEN`, so IDs can't be probed.
8. **Registration.** Each manifest lists its actions in `permissions: PermissionDefinition[]`. The registry (Phase 2) rejects duplicate action names at generation time. Core actions (`platform.*`) live in the core manifest, and acquisition actions (`acquisition.*`) in `src/modules/acquisition/manifest.ts`.
9. **The manifest rows must equal the project-rules matrix.** Phase 3's generated test walks every action × role × scope case against a fixture copied from the matrix. Phase 19 asserts that the manifests and the fixture are identical.
10. **System actors.** Services called by jobs or subscribers pass a `SYSTEM` `Actor` and are checked with `assertActorCan`: the action must be listed in the registered job's or subscriber's `systemActions` (`docs/contracts/jobs.md`, `docs/contracts/events.md`). The job itself was authorised when it was enqueued or scheduled. Every write records `actorType = SYSTEM`. A request made on behalf of a user always passes that user, never a SYSTEM actor.
11. **UI gating is a convenience only.** Pages compute booleans on the server with `can()` and pass plain flags to client components. The server action still calls `assertCan`/`requirePermission`.
12. **`assertActorCan`** is the actor-based form for services that receive an `Actor` (the SEAM-PERMISSION shape in Phases 5 and 6). For a USER actor it loads the user's role, status, service lines and `canApprove` from the database and applies `can()`. Phase 3 implements it next to `assertCan`.
13. **Admin area.** `platform.admin.access` (ADMIN and MANAGER) gates the `/admin` frame and the core manifest's Admin navigation. Each admin section is also gated by its own action (for example `platform.credential.manage`), so a MANAGER sees only the sections the matrix allows.

## 4. Worked example

```ts
const approve: PermissionDefinition = PermissionDefinitionSchema.parse({
  action: "acquisition.message.approve",
  label: "Approve outreach messages",
  scopes: { ADMIN: "ALL", MANAGER: "ALL", SERVICE_LEAD: "LINES", MEMBER: "OWN+A" },
  resourceFields: ["serviceLine", "ownerId"],
});

const lead = { serviceLine: "VIDEO_EDITING", ownerId: "cm1memberA0000000000000001", market: "NIGERIA" } as const;

// SERVICE_LEAD of VIDEO_EDITING → allowed (LINES)
can({ id: "cm1lead00000000000000000001", role: "SERVICE_LEAD", serviceLines: ["VIDEO_EDITING"], canApprove: false, status: "ACTIVE" },
    "acquisition.message.approve", lead);                                   // true
// SERVICE_LEAD of WEB_DEVELOPMENT → denied (OUT_OF_LINE)
can({ id: "cm1lead00000000000000000002", role: "SERVICE_LEAD", serviceLines: ["WEB_DEVELOPMENT"], canApprove: false, status: "ACTIVE" },
    "acquisition.message.approve", lead);                                   // false
// MEMBER who owns the lead but has canApprove=false → denied (NEEDS_APPROVER_FLAG)
can({ id: "cm1memberA0000000000000001", role: "MEMBER", serviceLines: ["VIDEO_EDITING"], canApprove: false, status: "ACTIVE" },
    "acquisition.message.approve", lead);                                   // false
// Same MEMBER with canApprove=true → allowed (OWN+A)
```

## 5. Invalid example (Phase 2 test)

```ts
PermissionDefinitionSchema.safeParse({
  action: "acquisition.approveMessage",
  label: "Approve",
  scopes: { ADMIN: "ALL", MANAGER: "ALL", SERVICE_LEAD: "LINES" },
});
// → fails twice: ["action"] "Use module.resource.verb" (only two segments);
//   ["scopes","MEMBER"] required (z.record with enum keys is exhaustive: all four roles must be present)
```
