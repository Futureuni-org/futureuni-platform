import "server-only";

/**
 * Reads for the "Pipeline value" home widget (naming convention: `*.repo.ts`). Open value is the
 * sum of SENT proposals (one current version per lead; older versions are SUPERSEDED) grouped by
 * currency — never summed across currencies (INV-11). Meetings-today counts the user's own
 * SCHEDULED meetings in a day window.
 */

import { db, type Prisma } from "@/platform/db";
import type { Currency } from "@/contracts/common";

export interface PipelineValueScope {
  serviceLines?: readonly string[];
  ownerId?: string;
}

function leadWhere(scope: PipelineValueScope): Prisma.LeadWhereInput {
  return {
    ...(scope.serviceLines === undefined
      ? {}
      : { serviceLine: { in: scope.serviceLines as never } }),
    ...(scope.ownerId === undefined ? {} : { ownerId: scope.ownerId }),
  };
}

/** Open pipeline value (SENT proposals) per currency for the scope. */
export async function sumOpenProposalValue(
  scope: PipelineValueScope,
): Promise<Partial<Record<Currency, number>>> {
  const rows = await db.proposal.groupBy({
    by: ["currency"],
    where: { status: "SENT", lead: leadWhere(scope) },
    _sum: { totalMinor: true },
  });
  const totals: Partial<Record<Currency, number>> = {};
  for (const row of rows) totals[row.currency] = row._sum.totalMinor ?? 0;
  return totals;
}

/** Count the user's own SCHEDULED meetings starting within [start, end). */
export async function countMeetingsInRange(
  ownerId: string,
  start: Date,
  end: Date,
): Promise<number> {
  return db.meeting.count({
    where: { ownerId, status: "SCHEDULED", startsAt: { gte: start, lt: end } },
  });
}
