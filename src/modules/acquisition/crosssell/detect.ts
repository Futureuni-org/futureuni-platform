import "server-only";

/**
 * Cross-sell detection (phase-11 Step 5). When a company has two or more open, qualified leads on
 * different lines, they become one CrossSellGroup with a single leading lead; the others are held so
 * outreach never runs parallel threads (INV-9). Runs on `lead.scored` and on a periodic job.
 */

import type { Actor, Clock, ServiceLine } from "@/contracts/common";
import { createOrOnConflict, withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { notify } from "@/platform/notifications";
import { getLineCapacity } from "@/platform/team";

import {
  createActiveGroup,
  findActiveGroup,
  findQualifiedOpenLeads,
  linkLeadToGroup,
  setLeadingLead,
  type QualifiedLead,
} from "./crosssell.repo";

export const CROSSSELL_DETECTED_NOTIFICATION = "crosssell.detected";

/** Leading lead: highest score; ties broken by the line with more free capacity, then lead id (stable). */
export function chooseLeadingLead(
  leads: readonly QualifiedLead[],
  freeCapacityByLine: ReadonlyMap<ServiceLine, number>,
): string {
  const sorted = [...leads].sort((a, b) => {
    const byScore = (b.score ?? 0) - (a.score ?? 0);
    if (byScore !== 0) return byScore;
    const byCapacity =
      (freeCapacityByLine.get(b.serviceLine) ?? 0) - (freeCapacityByLine.get(a.serviceLine) ?? 0);
    if (byCapacity !== 0) return byCapacity;
    return a.id.localeCompare(b.id);
  });
  const best = sorted[0];
  if (best === undefined) throw new Error("chooseLeadingLead needs at least one lead");
  return best.id;
}

export interface DetectResult {
  groupId: string | null;
  leadingLeadId: string | null;
  created: boolean;
}

export async function detectCrossSell(
  companyId: string,
  ctx: { actor: Actor; clock?: Clock },
): Promise<DetectResult> {
  const clock = ctx.clock ?? { now: () => new Date() };
  const leads = await findQualifiedOpenLeads(companyId);
  const lines = new Set(leads.map((l) => l.serviceLine));
  if (leads.length < 2 || lines.size < 2) {
    return { groupId: null, leadingLeadId: null, created: false };
  }

  const freeByLine = new Map<ServiceLine, number>();
  for (const line of lines) {
    freeByLine.set(line, (await getLineCapacity(line)).available);
  }
  const leadingLeadId = chooseLeadingLead(leads, freeByLine);
  const now = clock.now();

  const result = await withTransaction(async (tx) => {
    const existing = await findActiveGroup(tx, companyId);
    const created = existing === null;
    const group = created
      ? await createOrOnConflict(
          tx,
          "acq_cross_sell_groups_one_active_key",
          () => createActiveGroup(tx, { companyId, leadingLeadId, now }),
          async () => {
            const raced = await findActiveGroup(tx, companyId);
            if (raced === null) throw new Error("cross-sell group vanished mid-transaction");
            return raced;
          },
        )
      : existing;
    if (!created) await setLeadingLead(tx, group.id, leadingLeadId);

    for (const lead of leads) {
      await linkLeadToGroup(tx, lead.id, group.id, lead.id !== leadingLeadId);
    }

    if (created) {
      await publishAfterCommit(tx, {
        name: "crosssell.detected",
        actor: ctx.actor,
        payload: { groupId: group.id, companyId, leadIds: leads.map((l) => l.id), leadingLeadId },
      });
    }

    return { groupId: group.id, created };
  });

  if (result.created) {
    await notifyGroupOwners([...lines], result.groupId);
  }

  return { groupId: result.groupId, leadingLeadId, created: result.created };
}

/** Notifies the owners of every line in the group once (crosssell.detected notification type). */
async function notifyGroupOwners(lines: ServiceLine[], groupId: string): Promise<void> {
  const { getLineOwners } = await import("@/modules/acquisition/profiles");
  const userIds = new Set<string>();
  for (const line of lines) {
    for (const owner of await getLineOwners(line)) userIds.add(owner.id);
  }
  if (userIds.size === 0) return;
  try {
    await notify({
      userIds: [...userIds],
      type: CROSSSELL_DETECTED_NOTIFICATION,
      title: "Cross-sell opportunity",
      body: `A company now qualifies across ${String(lines.length)} service lines. Outreach leads with one line.`,
      link: `/acquisition/overview?crossSell=${groupId}`,
      dedupeKey: `crosssell.detected:${groupId}`,
    });
  } catch (error) {
    // Best-effort: a notification failure never undoes a detected group.
    console.warn(JSON.stringify({ event: "crosssell.notify.failed", groupId, error: String(error) }));
  }
}
