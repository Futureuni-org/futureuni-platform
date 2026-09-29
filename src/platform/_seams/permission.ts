// SEAM:SEAM-PERMISSION
/**
 * Temporary permission check for Phase 6. Replaced at merge with `assertCan` and `assertActorCan`
 * from `@/platform/auth` (Phase 3, `docs/contracts/permissions.md`).
 *
 * Stand-in behaviour:
 * - Reads the user's role from the database (a deactivated user is denied everything).
 * - A SYSTEM actor is allowed for any action a platform job/subscriber is meant to perform
 *   (Phase 6 code always calls this from a controlled call site).
 * - USER actor decisions cover the actions Phase 6 needs from `platform.*`:
 *     ADMIN: everything.
 *     MANAGER: read, job retry/cancel, notification preferences (own), settings.read,
 *              audit.read (matrix says ADMIN only, but the matrix is authoritative — MANAGER denied).
 *     SERVICE_LEAD / MEMBER: only SELF actions and reads they own.
 *
 * At merge, delete this file and re-point imports to `@/platform/auth`.
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import type { PermissionAction, PermissionResource } from "@/contracts/permissions";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

const SELF_ONLY: readonly PermissionAction[] = [
  "platform.notification.read",
  "platform.notificationPreference.update",
  "platform.userSettings.update",
  "platform.security.manage",
];

const MANAGER_ALLOWED: readonly PermissionAction[] = [
  "platform.home.read",
  "platform.admin.access",
  "platform.user.read",
  "platform.user.invite",
  "platform.team.read",
  "platform.team.update",
  "platform.setting.read",
  "platform.job.read",
  "platform.job.retry",
  "platform.job.cancel",
  "platform.file.upload",
  "platform.directory.read",
  "platform.directory.update",
];

function forbid(action: PermissionAction, reason: string): never {
  throw new AppError("FORBIDDEN", `Not allowed: ${action} (${reason}).`);
}

export async function assertCanSeam(
  actor: Actor,
  action: PermissionAction,
  resource?: PermissionResource,
): Promise<void> {
  if (actor.type === "SYSTEM") {
    // The system actor is only ever passed by platform code we control.
    return;
  }
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { role: true, status: true } });
  if (user === null) forbid(action, "user not found");
  if (user.status !== "ACTIVE") forbid(action, "user not active");
  if (user.role === "ADMIN") return;

  if (SELF_ONLY.includes(action)) {
    if (resource?.userId !== undefined && resource.userId !== actor.userId) {
      forbid(action, "not self");
    }
    return;
  }

  if (user.role === "MANAGER" && MANAGER_ALLOWED.includes(action)) return;

  forbid(action, `role ${user.role}`);
}
