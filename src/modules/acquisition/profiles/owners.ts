import "server-only";

/**
 * `getLineOwners(line)` — resolves the users who own a service line at request time.
 *
 * Definition (module spec §3.2): the users whose `TeamProfile.serviceLines` include the
 * line and whose `Role` matches the profile's `owners.roles` (default `SERVICE_LEAD`),
 * plus every user id in the profile's `owners.userIds`. Deleted users are excluded.
 */

import type { ServiceLine } from "@/contracts/common";
import { db } from "@/platform/db";

import { getActiveProfile } from "./read.repo";

export interface LineOwner {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MANAGER" | "SERVICE_LEAD" | "MEMBER";
}

export async function getLineOwners(line: ServiceLine): Promise<LineOwner[]> {
  const profile = await getActiveProfile(line);
  const roleFilter = profile.owners.roles;
  const explicitIds = new Set(profile.owners.userIds);

  const roleOwners = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: roleFilter.length > 0 ? roleFilter : ["SERVICE_LEAD"] },
      teamProfile: { is: { serviceLines: { has: line } } },
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  const explicitOwners =
    explicitIds.size === 0
      ? []
      : await db.user.findMany({
          where: { status: "ACTIVE", id: { in: [...explicitIds] } },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
        });

  const combined = new Map<string, LineOwner>();
  for (const u of roleOwners) combined.set(u.id, u);
  for (const u of explicitOwners) combined.set(u.id, u);
  return Array.from(combined.values());
}
