import "server-only";

import type { LeadStatus, ServiceLine } from "@/contracts/common";
import { db } from "@/platform/db";

export interface CalibrationLeadRow {
  id: string;
  score: number | null;
  scoreBand: "QUALIFIED" | "BORDERLINE" | "BELOW" | null;
}

/** Leads scored in [from, to) for a line (the calibration population). */
export async function findScoredLeadsInRange(
  line: ServiceLine,
  from: Date,
  to: Date,
): Promise<CalibrationLeadRow[]> {
  return db.lead.findMany({
    where: { serviceLine: line, score: { not: null }, scoredAt: { gte: from, lt: to } },
    select: { id: true, score: true, scoreBand: true },
  });
}

/** Distinct outcome statuses each lead ever reached (from its status history). */
export async function findOutcomeStatuses(
  leadIds: string[],
): Promise<{ leadId: string; toStatus: LeadStatus }[]> {
  if (leadIds.length === 0) return [];
  const rows = await db.leadEvent.findMany({
    where: {
      leadId: { in: leadIds },
      kind: "STATUS_CHANGE",
      toStatus: { in: ["REPLIED", "MEETING_BOOKED", "WON", "LOST"] },
    },
    select: { leadId: true, toStatus: true },
  });
  return rows.flatMap((r) => (r.toStatus === null ? [] : [{ leadId: r.leadId, toStatus: r.toStatus }]));
}

/** Lead ids with at least one overridden review (calibration feedback). */
export async function findOverriddenLeadIds(leadIds: string[]): Promise<string[]> {
  if (leadIds.length === 0) return [];
  const rows = await db.scoreReview.findMany({
    where: { leadId: { in: leadIds }, decisionType: "OVERRIDDEN" },
    select: { leadId: true },
    distinct: ["leadId"],
  });
  return rows.map((r) => r.leadId);
}
