import "server-only";

import type { SuppressionReason, SuppressionType } from "@/contracts/common";
import type { Tx } from "@/platform/db";

/** Live (not removed) suppressions whose value is one of the given values, per type. */
export function findLiveSuppressions(
  tx: Tx,
  values: { EMAIL: string[]; PHONE: string[]; DOMAIN: string[] },
): Promise<{ id: string; type: SuppressionType; reason: SuppressionReason; isHashed: boolean }[]> {
  const byType = (Object.entries(values) as [SuppressionType, string[]][])
    .filter(([, list]) => list.length > 0)
    .map(([type, list]) => ({ type, value: { in: list } }));
  if (byType.length === 0) return Promise.resolve([]);
  return tx.suppression.findMany({
    where: { removedAt: null, OR: byType },
    select: { id: true, type: true, reason: true, isHashed: true },
    orderBy: { createdAt: "asc" },
  });
}
