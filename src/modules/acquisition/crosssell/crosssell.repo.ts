import "server-only";

/**
 * Database access for cross-sell grouping. One active CrossSellGroup per company is enforced by the
 * partial unique index `acq_cross_sell_groups_one_active_key`; writes that create a group go through
 * `createOrOnConflict` rather than upsert (project-rules: never upsert through a partial unique index).
 */

import { LEAD_CLOSED_STATUSES } from "@/modules/acquisition/core";
import { db, type CrossSellGroup, type Lead, type Tx } from "@/platform/db";

export interface QualifiedLead {
  id: string;
  serviceLine: Lead["serviceLine"];
  market: Lead["market"];
  score: number | null;
  status: Lead["status"];
  ownerId: string | null;
}

/** Open (non-closed), QUALIFIED leads for a company — the cross-sell candidates. */
export async function findQualifiedOpenLeads(companyId: string): Promise<QualifiedLead[]> {
  return db.lead.findMany({
    where: {
      companyId,
      scoreBand: "QUALIFIED",
      status: { notIn: [...LEAD_CLOSED_STATUSES] },
    },
    select: { id: true, serviceLine: true, market: true, score: true, status: true, ownerId: true },
    orderBy: [{ score: "desc" }, { id: "asc" }],
  });
}

export async function findActiveGroup(tx: Tx, companyId: string): Promise<CrossSellGroup | null> {
  return tx.crossSellGroup.findFirst({ where: { companyId, status: "ACTIVE" } });
}

export async function createActiveGroup(
  tx: Tx,
  input: { companyId: string; leadingLeadId: string; now: Date },
): Promise<CrossSellGroup> {
  return tx.crossSellGroup.create({
    data: {
      companyId: input.companyId,
      status: "ACTIVE",
      leadingLeadId: input.leadingLeadId,
      detectedAt: input.now,
    },
  });
}

export async function setLeadingLead(tx: Tx, groupId: string, leadingLeadId: string): Promise<void> {
  await tx.crossSellGroup.update({ where: { id: groupId }, data: { leadingLeadId } });
}

export async function linkLeadToGroup(
  tx: Tx,
  leadId: string,
  groupId: string,
  held: boolean,
): Promise<void> {
  await tx.lead.update({
    where: { id: leadId },
    data: { crossSellGroupId: groupId, heldByCrossSell: held },
  });
}

export async function clearLeadGroup(tx: Tx, leadId: string): Promise<void> {
  await tx.lead.update({
    where: { id: leadId },
    data: { crossSellGroupId: null, heldByCrossSell: false },
  });
}

export async function markGroupSplit(
  tx: Tx,
  groupId: string,
  input: { splitById: string | null; now: Date },
): Promise<void> {
  await tx.crossSellGroup.update({
    where: { id: groupId },
    data: { status: "SPLIT", splitAt: input.now, splitById: input.splitById },
  });
}

export interface GroupWithLeads {
  group: CrossSellGroup;
  leads: QualifiedLead[];
}

export async function getGroup(groupId: string): Promise<CrossSellGroup | null> {
  return db.crossSellGroup.findUnique({ where: { id: groupId } });
}

export async function getGroupLeads(groupId: string): Promise<QualifiedLead[]> {
  return db.lead.findMany({
    where: { crossSellGroupId: groupId },
    select: { id: true, serviceLine: true, market: true, score: true, status: true, ownerId: true },
    orderBy: [{ score: "desc" }, { id: "asc" }],
  });
}

export async function getLeadGroupLink(
  leadId: string,
): Promise<{ crossSellGroupId: string | null; serviceLine: Lead["serviceLine"] } | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { crossSellGroupId: true, serviceLine: true },
  });
  return lead;
}

export async function getLeadCompanyId(leadId: string): Promise<string | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { companyId: true } });
  return lead?.companyId ?? null;
}

/** Companies with two or more open, qualified leads across different lines (the periodic sweep). */
export async function findCrossSellCandidateCompanies(limit: number): Promise<string[]> {
  const rows = await db.$queryRaw<{ companyId: string }[]>`
    SELECT "companyId"
    FROM acq_leads
    WHERE "scoreBand" = 'QUALIFIED'
      AND status NOT IN ('WON', 'LOST', 'DISQUALIFIED', 'SUPPRESSED')
    GROUP BY "companyId"
    HAVING COUNT(DISTINCT "serviceLine") >= 2
    LIMIT ${limit}
  `;
  return rows.map((r) => r.companyId);
}

/** A company has an active thread when any enrolment is ACTIVE or PAUSED (INV-9). */
export async function companyHasActiveThread(companyId: string): Promise<boolean> {
  const count = await db.enrollment.count({
    where: { companyId, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  return count > 0;
}

/** Active cross-sell groups with their leads, for the Overview tab. */
export async function listActiveGroups(filter: {
  from?: Date;
  to?: Date;
  lines?: Lead["serviceLine"][];
}): Promise<{ group: CrossSellGroup; leads: QualifiedLead[] }[]> {
  const groups = await db.crossSellGroup.findMany({
    where: {
      status: "ACTIVE",
      ...(filter.from || filter.to
        ? { detectedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } }
        : {}),
    },
    orderBy: { detectedAt: "desc" },
  });
  const wantedLines = filter.lines ?? [];
  const out: { group: CrossSellGroup; leads: QualifiedLead[] }[] = [];
  for (const group of groups) {
    const leads = await getGroupLeads(group.id);
    if (wantedLines.length > 0 && !leads.some((l) => wantedLines.includes(l.serviceLine))) continue;
    out.push({ group, leads });
  }
  return out;
}
