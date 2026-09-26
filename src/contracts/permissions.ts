/**
 * Contract: permissions (docs/contracts/permissions.md). The shape of the permission matrix;
 * the values are in .claude/project-rules.md §"Roles and permissions". Implemented by Phase 3
 * (@/platform/auth: can, assertCan, assertActorCan, requirePermission).
 */

import { z } from "zod";

import {
  IdSchema,
  MarketSchema,
  RoleSchema,
  ServiceLineSchema,
  UserStatusSchema,
  type Actor,
  type Role,
} from "./common";

export { ActorSchema, type Actor } from "./common";

/** Naming: module.resource.verb, all camelCase segments. e.g. "acquisition.message.approve". */
export const PermissionActionSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/, {
    error: "Use module.resource.verb",
  });
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
export const PermissionScopeSchema = z.enum([
  "ALL",
  "LINES",
  "OWN",
  "OWN+A",
  "SELF",
  "CEIL",
  "NONE",
]);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

/** Higher number = more privilege. Used by CEIL and by the invite/role-change rules. */
export const ROLE_RANK = {
  MEMBER: 1,
  SERVICE_LEAD: 2,
  MANAGER: 3,
  ADMIN: 4,
} as const satisfies Record<Role, number>;

/** One row of the matrix, as a manifest registers it. All four roles are required (z.record with enum keys is exhaustive). */
export const PermissionDefinitionSchema = z.object({
  action: PermissionActionSchema,
  label: z.string().min(3).max(80), // sentence case, e.g. "Approve outreach messages"
  description: z.string().max(280).optional(),
  scopes: z.record(RoleSchema, PermissionScopeSchema),
  /** Which resource fields the scope needs; drives the "missing field → deny" rule and the generated matrix test. */
  resourceFields: z
    .array(z.enum(["serviceLine", "ownerId", "userId", "targetRole", "market", "module"]))
    .default([]),
});
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;

/** The resource a check is made against. Built on the server from the loaded record, never from client input. */
export const PermissionResourceSchema = z.object({
  module: z.string().optional(),
  serviceLine: ServiceLineSchema.optional(),
  ownerId: IdSchema.nullable().optional(), // lead owner, meeting owner, handoff assignee…
  market: MarketSchema.optional(),
  userId: IdSchema.optional(), // for SELF-scoped actions
  targetRole: RoleSchema.optional(), // for CEIL-scoped actions (invites, role changes)
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
export type Can = (
  user: PermissionSubject,
  action: PermissionAction,
  resource?: PermissionResource,
) => boolean;
/** Throws AppError("FORBIDDEN", 403). */
export type AssertCan = (
  user: PermissionSubject,
  action: PermissionAction,
  resource?: PermissionResource,
) => void;
/**
 * Actor-based check for services that receive an Actor rather than a session (SEAM-PERMISSION in Phases 5 and 6 has this shape).
 * USER actor: loads the user's role, status, TeamProfile.serviceLines and canApprove from the database, then applies can().
 * SYSTEM actor: allowed only when `actor.job` names a registered job or subscriber whose `systemActions` include the action.
 * Throws AppError("FORBIDDEN", 403) otherwise.
 */
export type AssertActorCan = (
  actor: Actor,
  action: PermissionAction,
  resource?: PermissionResource,
) => Promise<void>;
/** Explains a decision for UI tooltips and tests. Never sent to the client with internal detail beyond the reason text. */
export interface PermissionDecision {
  allowed: boolean;
  scope: PermissionScope;
  reason:
    | "ALLOWED"
    | "UNREGISTERED_ACTION"
    | "ROLE_DENIED"
    | "MISSING_RESOURCE_FIELD"
    | "OUT_OF_LINE"
    | "NOT_OWNER"
    | "NEEDS_APPROVER_FLAG"
    | "NOT_SELF"
    | "ROLE_CEILING"
    | "USER_INACTIVE";
}
export type ExplainCan = (
  user: PermissionSubject,
  action: PermissionAction,
  resource?: PermissionResource,
) => PermissionDecision;

/** The full matrix as data: the union of every manifest's permissions[]. Built by the registry (getAllPermissions()). */
export type PermissionMatrix = ReadonlyMap<PermissionAction, PermissionDefinition>;
