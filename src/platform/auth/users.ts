/**
 * User administration (docs/specs/platform.md §7).
 *
 * Every mutation:
 *   - is permission-checked with `assertCan` against the .claude/project-rules matrix
 *   - refuses to leave the platform with zero active admins
 *   - writes an audit entry through SEAM-AUDIT
 *   - rotates the target user's sessions when their role or status changes
 *
 * Session rotation is done by deleting rows from the `sessions` table directly: it commits
 * inside the same transaction as the user update, so a hostile actor can never observe an
 * interval where an old session is still valid on a role/permission change.
 */

import "server-only";

import { z } from "zod";

import { CursorPageInputSchema, RoleSchema } from "@/contracts/common";
import type { Role } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { audit } from "@/platform/audit-log";
import { NEWEST_FIRST, afterClause, db, paginate, withTransaction, type Tx } from "@/platform/db";
import { sendEmail } from "@/platform/notifications";

import { actorOf, assertCan } from "./permissions";

export interface AdminActor {
  id: string;
  role: Role;
  canApprove: boolean;
}

async function assertAtLeastOneActiveAdmin(tx: Tx, ignoreUserId?: string): Promise<void> {
  const count = await tx.user.count({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
      ...(ignoreUserId === undefined ? {} : { NOT: { id: ignoreUserId } }),
    },
  });
  if (count < 1) {
    throw new AppError(
      "CONFLICT",
      "At least one active admin is required. Assign someone else first.",
    );
  }
}

export const ChangeRoleInputSchema = z.object({
  userId: z.string().min(1),
  newRole: RoleSchema,
});
export type ChangeRoleInput = z.infer<typeof ChangeRoleInputSchema>;

export async function changeRole(actor: AdminActor, raw: ChangeRoleInput): Promise<void> {
  const input = ChangeRoleInputSchema.parse(raw);
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.changeRole",
    { targetRole: input.newRole },
  );

  const result = await withTransaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    if (target === null) throw new AppError("NOT_FOUND");
    if (target.role === input.newRole) return null;

    if (target.role === "ADMIN") {
      // Lowering an ADMIN: verify at least one active admin remains AFTER the change.
      await assertAtLeastOneActiveAdmin(tx, target.id);
    }

    await tx.user.update({
      where: { id: target.id },
      data: {
        role: input.newRole,
        mustSetUp2fa: input.newRole === "ADMIN" ? true : false,
      },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });

    await audit.record(tx, {
      actor: actorOf({ id: actor.id, role: actor.role }),
      action: "platform.user.changeRole",
      targetType: "User",
      targetId: target.id,
      before: { role: target.role },
      after: { role: input.newRole },
    });
    return target;
  });

  if (result !== null) {
    const changer = await db.user.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    await sendEmail({
      template: "role-changed",
      to: result.email,
      props: {
        name: result.name,
        fromRole: result.role,
        toRole: input.newRole,
        changedByName: changer?.name ?? "an administrator",
      },
    });
  }
}

export async function deactivateUser(actor: AdminActor, userId: string): Promise<void> {
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.deactivate",
    { targetRole: "MEMBER" },
  );
  await withTransaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (target === null) throw new AppError("NOT_FOUND");
    if (target.status === "DEACTIVATED") return;

    if (target.role === "ADMIN") await assertAtLeastOneActiveAdmin(tx, target.id);

    await tx.user.update({
      where: { id: target.id },
      data: {
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
        banned: true,
        banReason: "Deactivated by administrator",
      },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });

    await audit.record(tx, {
      actor: actorOf({ id: actor.id, role: actor.role }),
      action: "platform.user.deactivate",
      targetType: "User",
      targetId: target.id,
      before: { status: target.status },
      after: { status: "DEACTIVATED" },
    });
  });
}

export async function reactivateUser(actor: AdminActor, userId: string): Promise<void> {
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.deactivate",
    { targetRole: "MEMBER" },
  );
  await withTransaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (target === null) throw new AppError("NOT_FOUND");
    if (target.status === "ACTIVE") return;

    await tx.user.update({
      where: { id: target.id },
      data: {
        status: "ACTIVE",
        deactivatedAt: null,
        banned: false,
        banReason: null,
      },
    });
    await audit.record(tx, {
      actor: actorOf({ id: actor.id, role: actor.role }),
      action: "platform.user.deactivate",
      targetType: "User",
      targetId: target.id,
      before: { status: target.status },
      after: { status: "ACTIVE" },
    });
  });
}

export async function resetUser2FA(actor: AdminActor, userId: string): Promise<void> {
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.reset2fa",
    { targetRole: "MEMBER" },
  );
  await withTransaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, name: true },
    });
    if (target === null) throw new AppError("NOT_FOUND");

    await tx.twoFactor.deleteMany({ where: { userId: target.id } });
    await tx.user.update({
      where: { id: target.id },
      data: {
        twoFactorEnabled: false,
        mustSetUp2fa: target.role === "ADMIN",
      },
    });
    await tx.session.deleteMany({ where: { userId: target.id } });

    await audit.record(tx, {
      actor: actorOf({ id: actor.id, role: actor.role }),
      action: "platform.user.reset2fa",
      targetType: "User",
      targetId: target.id,
      after: { twoFactorEnabled: false },
    });
  });
}

export async function forceSignOut(actor: AdminActor, userId: string): Promise<void> {
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.forceSignOut",
    { targetRole: "MEMBER" },
  );
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (target === null) throw new AppError("NOT_FOUND");
  await db.session.deleteMany({ where: { userId: target.id } });
  await audit.record(null, {
    actor: actorOf({ id: actor.id, role: actor.role }),
    action: "platform.user.forceSignOut",
    targetType: "User",
    targetId: target.id,
  });
}

export const ListUsersInputSchema = CursorPageInputSchema.extend({
  role: RoleSchema.optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
  search: z.string().max(120).optional(),
});
export type ListUsersInput = z.infer<typeof ListUsersInputSchema>;

export interface ListedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "DEACTIVATED";
  twoFactorEnabled: boolean;
  mustSetUp2fa: boolean;
  lastActiveAt: Date | null;
}

export async function listUsers(
  actor: AdminActor,
  raw: ListUsersInput,
): Promise<{ items: ListedUser[]; nextCursor: string | null }> {
  const input = ListUsersInputSchema.parse(raw);
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.read",
  );

  const page = await paginate(input, async ({ after, take }) => {
    const filters = {
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: input.search, mode: "insensitive" as const } },
              { email: { contains: input.search, mode: "insensitive" as const } },
            ],
          }),
    };
    return db.user.findMany({
      where: { AND: [filters, afterClause(after)] },
      orderBy: [...NEWEST_FIRST],
      take,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        twoFactorEnabled: true,
        mustSetUp2fa: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
  });

  return {
    items: page.items.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      twoFactorEnabled: row.twoFactorEnabled,
      mustSetUp2fa: row.mustSetUp2fa,
      lastActiveAt: row.lastActiveAt,
    })),
    nextCursor: page.nextCursor,
  };
}
