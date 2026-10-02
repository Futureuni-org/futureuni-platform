import "server-only";

/**
 * Owner routing and SLA assignment (module spec §3.12, prompt step 4). The owner is the lead's
 * owner, else the line's owners by round robin weighted by free capacity, else the managers. An
 * actionable reply starts an SLA timer in the owner's timezone and working hours.
 */

import type { Actor, Market, ReplyClass, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { publishAfterCommit } from "@/platform/events";
import { withTransaction, type Tx } from "@/platform/db";
import { getLineOwners } from "@/modules/acquisition/profiles";

import {
  getOwnerCapacities,
  getWorkingPattern,
  setLeadOwnerIfUnset,
  setReplySla,
  setThreadAssignee,
  setThreadSnooze,
} from "../inbox.repo";
import { computeSlaDueAt, isActionable, type WorkingPattern } from "./sla";

const DEFAULT_PATTERN: WorkingPattern = {
  timezone: "Africa/Lagos",
  workingDays: [1, 2, 3, 4, 5],
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
};

/** The best owner for a line: most free capacity among its owners, or null when it has none. */
export async function resolveOwner(serviceLine: ServiceLine): Promise<string | null> {
  const owners = await getLineOwners(serviceLine);
  if (owners.length === 0) return null;
  const capacities = await getOwnerCapacities(owners.map((o) => o.id));
  if (capacities.length === 0) return owners[0]?.id ?? null;
  return capacities[0]?.userId ?? owners[0]?.id ?? null;
}

export interface RoutingScope {
  leadId: string;
  serviceLine: ServiceLine;
  market: Market;
  currentOwnerId: string | null;
  replyId: string;
  classification: ReplyClass;
  receivedAt: Date;
  slaBusinessHours: number;
}

/** Sets the owner if unset and starts the SLA timer for an actionable reply. Returns the owner id. */
export async function applyRouting(tx: Tx, actor: Actor, scope: RoutingScope): Promise<string | null> {
  let ownerId = scope.currentOwnerId;

  if (ownerId === null) {
    const resolved = await resolveOwner(scope.serviceLine);
    if (resolved !== null) {
      const result = await setLeadOwnerIfUnset(tx, scope.leadId, resolved);
      if (result.changed) {
        ownerId = resolved;
        await setThreadAssignee(tx, scope.leadId, resolved);
        await publishAfterCommit(tx, {
          name: "lead.assigned",
          actor,
          payload: { leadId: scope.leadId, fromOwnerId: null, toOwnerId: resolved },
        });
      }
    }
  }

  if (isActionable(scope.classification)) {
    const pattern = ownerId === null ? DEFAULT_PATTERN : ((await getWorkingPattern(ownerId)) ?? DEFAULT_PATTERN);
    const dueAt = computeSlaDueAt(scope.receivedAt, scope.slaBusinessHours, pattern);
    await setReplySla(tx, scope.replyId, { slaStatus: "ON_TRACK", slaDueAt: dueAt });
  }

  return ownerId;
}

/** Human assignment of a lead's inbox thread (permission `acquisition.inbox.assign`). */
export async function assignThread(actor: Actor, leadId: string, userId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { serviceLine: true, ownerId: true } });
    if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
    await assertActorCan(actor, "acquisition.inbox.assign", {
      serviceLine: lead.serviceLine,
      ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
    });
    await tx.lead.update({ where: { id: leadId }, data: { ownerId: userId } });
    await setThreadAssignee(tx, leadId, userId);
    await audit.record(tx, {
      actor,
      action: "acquisition.inbox.assign",
      targetType: "Lead",
      targetId: leadId,
      before: { ownerId: lead.ownerId },
      after: { ownerId: userId },
    });
    if (lead.ownerId !== userId) {
      await publishAfterCommit(tx, {
        name: "lead.assigned",
        actor,
        payload: { leadId, fromOwnerId: lead.ownerId, toOwnerId: userId },
      });
    }
  });
}

/** Snoozes a lead's inbox thread until a given instant (permission `acquisition.inbox.read`). */
export async function snoozeThread(actor: Actor, leadId: string, until: Date | null): Promise<void> {
  await withTransaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { serviceLine: true, ownerId: true } });
    if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
    await assertActorCan(actor, "acquisition.inbox.read", {
      serviceLine: lead.serviceLine,
      ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
    });
    await setThreadSnooze(tx, leadId, until);
  });
}
