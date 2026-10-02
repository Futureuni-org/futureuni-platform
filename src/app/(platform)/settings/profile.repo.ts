import "server-only";

/**
 * Self-service profile writes (name, avatar, timezone). There is no SELF profile service in the
 * platform yet (team updates require ADMIN/MANAGER), so this `*.repo.ts` writes the signed-in
 * user's own `User`/`TeamProfile` rows and audits the change (INV-20). Scope is the session user
 * id only — never request input. See CR-18-GAP-SELF-PROFILE in phases/18/REQUESTS.md.
 */

import type { Actor } from "@/contracts/common";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

export async function updateOwnProfile(
  actor: Actor,
  userId: string,
  patch: { name?: string; image?: string | null; timezone?: string },
): Promise<void> {
  await withTransaction(async (tx) => {
    const userData: { name?: string; image?: string | null } = {};
    if (patch.name !== undefined) userData.name = patch.name;
    if (patch.image !== undefined) userData.image = patch.image;
    if (Object.keys(userData).length > 0) {
      await tx.user.update({ where: { id: userId }, data: userData });
    }
    if (patch.timezone !== undefined) {
      await tx.teamProfile.update({ where: { userId }, data: { timezone: patch.timezone } });
    }
    await audit.record(tx, {
      actor,
      action: "platform.userSettings.update",
      targetType: "User",
      targetId: userId,
      after: {
        ...(patch.name !== undefined ? { nameChanged: true } : {}),
        ...(patch.image !== undefined ? { avatarChanged: true } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      },
    });
  });
}
