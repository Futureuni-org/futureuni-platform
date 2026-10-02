import "server-only";

import { db } from "@/platform/db";
import type { Role, ServiceLine } from "@/contracts/common";

/**
 * Interim pending-invites reader. `@/platform/auth` exposes create/revoke/resend/accept but no
 * list of pending invites, so this `*.repo.ts` reads them for display only. Replace with a
 * `listInvites` service at integration — see CR-18-GAP-LIST-INVITES in phases/18/REQUESTS.md.
 */

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  serviceLines: ServiceLine[];
  expiresAt: Date;
  lastSentAt: Date | null;
  sendCount: number;
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  return db.invite.findMany({
    where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      serviceLines: true,
      expiresAt: true,
      lastSentAt: true,
      sendCount: true,
    },
  });
}
