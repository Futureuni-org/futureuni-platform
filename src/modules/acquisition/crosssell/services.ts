import "server-only";

/**
 * Cross-sell services: the SEAM-CROSSSELL context read, and the owner-facing management services
 * (set the leading lead, split a group). Every mutation checks `acquisition.crossSell.manage` for
 * each line in the group and is audited.
 */

import type { Actor, Clock, Market, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { audit } from "@/platform/audit-log";
import { assertActorCan } from "@/platform/auth";
import { withTransaction } from "@/platform/db";

import {
  clearLeadGroup,
  companyHasActiveThread,
  getGroup,
  getGroupLeads,
  getLeadGroupLink,
  linkLeadToGroup,
  listActiveGroups,
  markGroupSplit,
  setLeadingLead as setLeadingLeadRow,
  type QualifiedLead,
} from "./crosssell.repo";

/** SEAM-CROSSSELL. A lead with no active group is treated as leading (outreach may draft for it). */
export async function getCrossSellContext(leadId: string): Promise<{
  groupId: string | null;
  isLeading: boolean;
  leadingLeadId: string | null;
  lines: ServiceLine[];
}> {
  const link = await getLeadGroupLink(leadId);
  if (link === null) {
    return { groupId: null, isLeading: true, leadingLeadId: null, lines: [] };
  }
  if (link.crossSellGroupId === null) {
    return { groupId: null, isLeading: true, leadingLeadId: null, lines: [link.serviceLine] };
  }
  const group = await getGroup(link.crossSellGroupId);
  if (group?.status !== "ACTIVE") {
    return { groupId: null, isLeading: true, leadingLeadId: null, lines: [link.serviceLine] };
  }
  const leads = await getGroupLeads(group.id);
  const lines = [...new Set(leads.map((l) => l.serviceLine))];
  return {
    groupId: group.id,
    isLeading: group.leadingLeadId === leadId,
    leadingLeadId: group.leadingLeadId,
    lines,
  };
}

async function assertCanManage(actor: Actor, leads: readonly QualifiedLead[]): Promise<void> {
  const lines = new Set(leads.map((l) => l.serviceLine));
  for (const serviceLine of lines) {
    await assertActorCan(actor, "acquisition.crossSell.manage", { serviceLine });
  }
}

/** Changes which lead leads the group; re-applies the held flags. */
export async function setLeadingLead(
  actor: Actor,
  groupId: string,
  leadId: string,
): Promise<void> {
  const group = await getGroup(groupId);
  if (group?.status !== "ACTIVE") {
    throw new AppError("NOT_FOUND", "That cross-sell group doesn't exist or is closed.");
  }
  const leads = await getGroupLeads(groupId);
  if (!leads.some((l) => l.id === leadId)) {
    throw new AppError("VALIDATION_FAILED", "That lead isn't in this group.");
  }
  await assertCanManage(actor, leads);

  await withTransaction(async (tx) => {
    await setLeadingLeadRow(tx, groupId, leadId);
    for (const lead of leads) {
      await linkLeadToGroup(tx, lead.id, groupId, lead.id !== leadId);
    }
    await audit.record(tx, {
      actor,
      action: "acquisition.crossSell.manage",
      targetType: "acquisition.crossSellGroup",
      targetId: groupId,
      after: { leadingLeadId: leadId },
    });
  });
}

/** Splits a group so each lead stands alone. Allowed only when no thread is active (INV-9). */
export async function splitGroup(
  actor: Actor,
  groupId: string,
  opts: { clock?: Clock } = {},
): Promise<void> {
  const group = await getGroup(groupId);
  if (group?.status !== "ACTIVE") {
    throw new AppError("NOT_FOUND", "That cross-sell group doesn't exist or is closed.");
  }
  const leads = await getGroupLeads(groupId);
  await assertCanManage(actor, leads);

  if (await companyHasActiveThread(group.companyId)) {
    throw new AppError("CONFLICT", "This group has an active outreach thread and can't be split.");
  }

  const now = (opts.clock ?? { now: () => new Date() }).now();
  const splitById = actor.type === "USER" ? actor.userId : null;

  await withTransaction(async (tx) => {
    for (const lead of leads) await clearLeadGroup(tx, lead.id);
    await markGroupSplit(tx, groupId, { splitById, now });
    await audit.record(tx, {
      actor,
      action: "acquisition.crossSell.manage",
      targetType: "acquisition.crossSellGroup",
      targetId: groupId,
      after: { status: "SPLIT" },
    });
  });
}

export interface CrossSellOpportunity {
  groupId: string;
  companyId: string;
  leadingLeadId: string | null;
  detectedAt: Date;
  leads: { id: string; serviceLine: ServiceLine; market: Market; score: number | null; isLeading: boolean }[];
  lines: ServiceLine[];
}

/** Active cross-sell opportunities for the Overview tab. */
export async function listCrossSellOpportunities(filter: {
  from?: Date;
  to?: Date;
  lines?: ServiceLine[];
}): Promise<CrossSellOpportunity[]> {
  const groups = await listActiveGroups(filter);
  return groups.map(({ group, leads }) => ({
    groupId: group.id,
    companyId: group.companyId,
    leadingLeadId: group.leadingLeadId,
    detectedAt: group.detectedAt,
    leads: leads.map((l) => ({
      id: l.id,
      serviceLine: l.serviceLine,
      market: l.market,
      score: l.score,
      isLeading: group.leadingLeadId === l.id,
    })),
    lines: [...new Set(leads.map((l) => l.serviceLine))],
  }));
}
