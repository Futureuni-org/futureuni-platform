/**
 * The permission engine (docs/contracts/permissions.md, .claude/project-rules.md §Roles).
 *
 * Pure, deny-by-default evaluation of the registered permission matrix. Actions come from the
 * module registry (`getAllPermissions()`); a matrix that isn't registered is always denied, and
 * in development the denial logs a warning. Nothing here talks to the database except
 * `assertActorCan`, which loads the user's role, status and team profile fields when the caller
 * has an `Actor` rather than a session.
 *
 * Callers never compare role strings themselves (saas-auth rule). `can()` looks up the action's
 * `scopes[user.role]` and evaluates it against the given resource.
 */

import "server-only";

import type { Actor, Role } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import type {
  PermissionAction,
  PermissionDecision,
  PermissionDefinition,
  PermissionResource,
  PermissionScope,
  PermissionSubject,
} from "@/contracts/permissions";
import { ROLE_RANK } from "@/contracts/permissions";
import { db } from "@/platform/db";
import { getAllJobs, getAllPermissions, getAllSubscribers } from "@/platform/registry";

let cached: Map<PermissionAction, PermissionDefinition> | null = null;

function matrix(): Map<PermissionAction, PermissionDefinition> {
  if (cached === null) {
    const map = new Map<PermissionAction, PermissionDefinition>();
    for (const definition of getAllPermissions()) map.set(definition.action, definition);
    cached = map;
  }
  return cached;
}

/** For tests only: clear the cached matrix. */
export function _resetPermissionCache(): void {
  cached = null;
}

function warnUnregistered(action: PermissionAction): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[auth] Unregistered permission action denied: "${action}"`);
  }
}

function evaluate(
  user: PermissionSubject,
  action: PermissionAction,
  resource: PermissionResource | undefined,
): PermissionDecision {
  if (user.status === "DEACTIVATED") {
    return { allowed: false, scope: "NONE", reason: "USER_INACTIVE" };
  }
  const definition = matrix().get(action);
  if (definition === undefined) {
    warnUnregistered(action);
    return { allowed: false, scope: "NONE", reason: "UNREGISTERED_ACTION" };
  }
  const scope: PermissionScope = definition.scopes[user.role];
  switch (scope) {
    case "ALL":
      return { allowed: true, scope, reason: "ALLOWED" };
    case "NONE":
      return { allowed: false, scope, reason: "ROLE_DENIED" };
    case "SELF": {
      const userId = resource?.userId;
      if (userId === undefined) return { allowed: false, scope, reason: "MISSING_RESOURCE_FIELD" };
      return userId === user.id
        ? { allowed: true, scope, reason: "ALLOWED" }
        : { allowed: false, scope, reason: "NOT_SELF" };
    }
    case "LINES": {
      const serviceLine = resource?.serviceLine;
      if (serviceLine === undefined)
        return { allowed: false, scope, reason: "MISSING_RESOURCE_FIELD" };
      return user.serviceLines.includes(serviceLine)
        ? { allowed: true, scope, reason: "ALLOWED" }
        : { allowed: false, scope, reason: "OUT_OF_LINE" };
    }
    case "OWN":
    case "OWN+A": {
      const { serviceLine, ownerId } = resource ?? {};
      if (serviceLine === undefined || ownerId === undefined || ownerId === null) {
        return { allowed: false, scope, reason: "MISSING_RESOURCE_FIELD" };
      }
      if (!user.serviceLines.includes(serviceLine)) {
        return { allowed: false, scope, reason: "OUT_OF_LINE" };
      }
      if (ownerId !== user.id) return { allowed: false, scope, reason: "NOT_OWNER" };
      if (scope === "OWN+A" && !user.canApprove) {
        return { allowed: false, scope, reason: "NEEDS_APPROVER_FLAG" };
      }
      return { allowed: true, scope, reason: "ALLOWED" };
    }
    case "CEIL": {
      const targetRole = resource?.targetRole;
      if (targetRole === undefined)
        return { allowed: false, scope, reason: "MISSING_RESOURCE_FIELD" };
      // CEIL is never satisfied for ADMIN targets (project-rules wording; only non-admins are ever
      // evaluated under CEIL).
      if (targetRole === "ADMIN") return { allowed: false, scope, reason: "ROLE_CEILING" };
      return ROLE_RANK[targetRole] <= ROLE_RANK[user.role]
        ? { allowed: true, scope, reason: "ALLOWED" }
        : { allowed: false, scope, reason: "ROLE_CEILING" };
    }
    default:
      return { allowed: false, scope: "NONE", reason: "ROLE_DENIED" };
  }
}

/** Whether the user may perform the action on the resource. Pure, no I/O. */
export function can(
  user: PermissionSubject,
  action: PermissionAction,
  resource?: PermissionResource,
): boolean {
  return evaluate(user, action, resource).allowed;
}

/** Full decision including the reason. Used by tests and by UI tooltips. */
export function explainCan(
  user: PermissionSubject,
  action: PermissionAction,
  resource?: PermissionResource,
): PermissionDecision {
  return evaluate(user, action, resource);
}

/** Throws `AppError("FORBIDDEN", 403)` when the user isn't allowed. */
export function assertCan(
  user: PermissionSubject,
  action: PermissionAction,
  resource?: PermissionResource,
): void {
  const decision = evaluate(user, action, resource);
  if (!decision.allowed) {
    throw new AppError("FORBIDDEN", undefined, { details: { action, reason: decision.reason } });
  }
}

async function loadSubjectFromUserId(userId: string): Promise<PermissionSubject | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      teamProfile: { select: { serviceLines: true, canApprove: true } },
    },
  });
  if (user === null) return null;
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    serviceLines: user.teamProfile?.serviceLines ?? [],
    canApprove: user.teamProfile?.canApprove ?? false,
  };
}

/**
 * Actor-based permission check for services that receive an `Actor` rather than a session.
 *
 * - USER actor: loads role, status, service lines and canApprove from the database, then applies
 *   `can()`. A deactivated or missing user is denied.
 * - SYSTEM actor: allowed only when `actor.job` names a registered job or subscriber whose
 *   `systemActions` includes the action.
 *
 * Throws `AppError("FORBIDDEN", 403)` otherwise.
 */
export async function assertActorCan(
  actor: Actor,
  action: PermissionAction,
  resource?: PermissionResource,
): Promise<void> {
  if (actor.type === "USER") {
    const subject = await loadSubjectFromUserId(actor.userId);
    if (subject === null) {
      throw new AppError("FORBIDDEN", undefined, { details: { action, reason: "USER_INACTIVE" } });
    }
    assertCan(subject, action, resource);
    return;
  }
  // SYSTEM actor: read the systemActions of the named job or subscriber.
  const allowed = new Set<string>();
  for (const job of getAllJobs()) {
    if (job.name === actor.job) for (const a of job.systemActions ?? []) allowed.add(a);
  }
  for (const subscriber of getAllSubscribers()) {
    if (subscriber.id === actor.job)
      for (const a of subscriber.systemActions ?? []) allowed.add(a);
  }
  if (!allowed.has(action)) {
    throw new AppError("FORBIDDEN", undefined, {
      details: { action, reason: "ROLE_DENIED", actor: "SYSTEM", job: actor.job },
    });
  }
}

/** Build an Actor from a session user, for audit logs and event envelopes. */
export function actorOf(user: { id: string; role: Role }): Actor {
  return { type: "USER", userId: user.id, role: user.role };
}
