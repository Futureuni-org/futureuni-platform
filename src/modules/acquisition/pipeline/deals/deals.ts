/**
 * Won, lost and handoff (module spec §3.13 "Won"/"Lost", §5). `markWon` creates the deal, stops
 * the company's enrolments (INV-3), builds the handoff with a capacity-based suggested owner per
 * service, and emits `deal.won`/`handoff.created`. `markLost` records a structured reason and an
 * optional re-engagement date. Re-engagement moves `LOST → NURTURE` on the due date.
 */

import "server-only";

import type { HandoffContent } from "@/contracts/acquisition-records";
import type { Actor, Clock, Currency, LostReason, ServiceLine } from "@/contracts/common";
import { LostReasonSchema, MARKET_CURRENCIES } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { putFile } from "@/platform/storage";
import { recalculateLoad } from "@/platform/team";

import { transitionLead } from "@/modules/acquisition/core";

import { stopEnrollments } from "../_seams";
import * as repo from "../pipeline.repo";
import { PIPELINE_NOTIFICATION_TYPES } from "../notifications";
import { notifySafe, pipelineLog, publishStatusChanged } from "../shared";
import { suggestDeliveryOwner } from "./capacity";
import { buildHandoffContent, handoffToMarkdown } from "./handoff-content";

const DEAL_TARGET = "acquisition.deal";
const HANDOFF_TARGET = "acquisition.handoff";

function clockNow(clock?: Clock): Date {
  return (clock ?? { now: () => new Date() }).now();
}

export interface MarkWonInput {
  valueMinor: number;
  currency: Currency;
  services: ServiceLine[];
  proposalId?: string | null;
  packageIds?: string[];
  startDate?: Date | null;
  notes?: string | null;
  paymentNotes?: string;
}

export interface MarkWonResult {
  dealId: string;
  handoffId: string;
}

export async function markWon(
  actor: Actor,
  leadId: string,
  input: MarkWonInput,
  clock?: Clock,
): Promise<MarkWonResult> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.deal.close", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });

  if (!Number.isInteger(input.valueMinor) || input.valueMinor <= 0) {
    throw new AppError("VALIDATION_FAILED", "A won deal needs a positive value in minor units.");
  }
  if (input.services.length === 0) {
    throw new AppError("VALIDATION_FAILED", "A won deal needs at least one service.");
  }
  const allowed: readonly Currency[] = MARKET_CURRENCIES[scope.market];
  if (!allowed.includes(input.currency)) {
    throw new AppError("VALIDATION_FAILED", `A ${scope.market} deal can't be valued in ${input.currency}.`);
  }
  const actorId = actor.type === "USER" ? actor.userId : null;
  if (actorId === null) throw new AppError("FORBIDDEN", "A deal must be closed by a user.");

  const now = clockNow(clock);
  const brief = await repo.getLeadBriefFields(leadId);
  const content = await buildHandoffContent({
    leadId,
    companyId: scope.companyId,
    market: scope.market,
    services: input.services,
    valueMinor: input.valueMinor,
    currency: input.currency,
    startDate: input.startDate ?? null,
    paymentNotes: input.paymentNotes ?? "",
    proposalId: input.proposalId ?? null,
    keyFindingIds: brief?.keyFindingIds ?? [],
    now,
  });

  const suggestions = await Promise.all(
    input.services.map(async (serviceLine) => ({ serviceLine, suggestedUserId: await suggestDeliveryOwner(serviceLine) })),
  );

  const result = await withTransaction(async (tx) => {
    const deal = await repo.createDeal(tx, {
      leadId,
      companyId: scope.companyId,
      serviceLine: scope.serviceLine,
      market: scope.market,
      outcome: "WON",
      valueMinor: input.valueMinor,
      currency: input.currency,
      services: input.services,
      packageIds: input.packageIds ?? [],
      proposalId: input.proposalId ?? null,
      startDate: input.startDate ?? null,
      notes: input.notes ?? null,
      lostReason: null,
      competitor: null,
      lostNote: null,
      reengageAt: null,
      closedById: actorId,
    });
    const transition = await transitionLead(tx, { leadId, to: "WON", actor, reason: "deal:won", clock: { now: () => now } });
    await stopEnrollments(tx, { companyId: scope.companyId }, "WON");
    const handoff = await repo.createHandoff(tx, {
      dealId: deal.id,
      companyId: scope.companyId,
      content,
      markdown: handoffToMarkdown(content),
      assignments: suggestions,
    });

    await audit.record(tx, { actor, action: "acquisition.deal.close", targetType: DEAL_TARGET, targetId: deal.id, after: { outcome: "WON", valueMinor: input.valueMinor, currency: input.currency } });
    await publishStatusChanged(tx, actor, transition.event, { leadId, serviceLine: scope.serviceLine, market: scope.market }, "deal:won");
    await publishAfterCommit(tx, {
      name: "deal.won",
      actor,
      payload: {
        dealId: deal.id,
        leadId,
        companyId: scope.companyId,
        serviceLine: scope.serviceLine,
        market: scope.market,
        valueMinor: input.valueMinor,
        currency: input.currency,
        services: input.services,
      },
    });
    await publishAfterCommit(tx, { name: "handoff.created", actor, payload: { handoffId: handoff.id, dealId: deal.id } });
    return { dealId: deal.id, handoffId: handoff.id };
  });

  return result;
}

export interface MarkLostInput {
  reason: LostReason;
  competitor?: string | null;
  note?: string | null;
  reengageAt?: Date | null;
}

export async function markLost(
  actor: Actor,
  leadId: string,
  input: MarkLostInput,
  clock?: Clock,
): Promise<{ dealId: string }> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.deal.close", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  if (!LostReasonSchema.safeParse(input.reason).success) {
    throw new AppError("VALIDATION_FAILED", "A lost deal needs a valid reason.");
  }
  const actorId = actor.type === "USER" ? actor.userId : null;
  if (actorId === null) throw new AppError("FORBIDDEN", "A deal must be closed by a user.");
  const now = clockNow(clock);

  const dealId = await withTransaction(async (tx) => {
    const deal = await repo.createDeal(tx, {
      leadId,
      companyId: scope.companyId,
      serviceLine: scope.serviceLine,
      market: scope.market,
      outcome: "LOST",
      valueMinor: null,
      currency: null,
      services: [],
      packageIds: [],
      proposalId: null,
      startDate: null,
      notes: input.note ?? null,
      lostReason: input.reason,
      competitor: input.competitor ?? null,
      lostNote: input.note ?? null,
      reengageAt: input.reengageAt ?? null,
      closedById: actorId,
    });
    const transition = await transitionLead(tx, { leadId, to: "LOST", actor, reason: `lost:${input.reason}`, clock: { now: () => now } });
    await stopEnrollments(tx, { companyId: scope.companyId }, "LOST");
    await audit.record(tx, { actor, action: "acquisition.deal.close", targetType: DEAL_TARGET, targetId: deal.id, after: { outcome: "LOST", reason: input.reason } });
    await publishStatusChanged(tx, actor, transition.event, { leadId, serviceLine: scope.serviceLine, market: scope.market }, `lost:${input.reason}`);
    await publishAfterCommit(tx, { name: "deal.lost", actor, payload: { dealId: deal.id, leadId, reason: input.reason } });
    return deal.id;
  });

  return { dealId };
}

export interface AssignHandoffInput {
  serviceLine: ServiceLine;
  userId: string;
}

export async function assignHandoff(
  actor: Actor,
  handoffId: string,
  input: AssignHandoffInput,
  clock?: Clock,
): Promise<void> {
  const handoff = await repo.getHandoffWithDeal(handoffId);
  if (handoff === null) throw new AppError("NOT_FOUND", "That handoff doesn't exist.");
  await assertActorCan(actor, "acquisition.handoff.assign", { serviceLine: handoff.deal.serviceLine });
  const actorId = actor.type === "USER" ? actor.userId : null;
  if (actorId === null) throw new AppError("FORBIDDEN", "A handoff must be assigned by a user.");
  const now = clockNow(clock);

  const { previousUserId } = await withTransaction(async (tx) => {
    const res = await repo.assignHandoffLine(tx, handoffId, input.serviceLine, input.userId, actorId, now);
    await audit.record(tx, { actor, action: "acquisition.handoff.assign", targetType: HANDOFF_TARGET, targetId: handoffId, after: { serviceLine: input.serviceLine, userId: input.userId } });
    return res;
  });

  // Recalculate load so Phase 11 throttling reacts (outside the assign transaction).
  await recalculateLoad(input.userId);
  if (previousUserId !== null && previousUserId !== input.userId) await recalculateLoad(previousUserId);

  await notifySafe({
    userIds: [input.userId],
    type: PIPELINE_NOTIFICATION_TYPES.handoffAssigned,
    title: "A handoff was assigned to you",
    dedupeKey: `handoff.assigned:${handoffId}:${input.serviceLine}`,
  });
}

export async function acknowledgeHandoff(actor: Actor, handoffId: string, clock?: Clock): Promise<void> {
  const handoff = await repo.getHandoffWithDeal(handoffId);
  if (handoff === null) throw new AppError("NOT_FOUND", "That handoff doesn't exist.");
  const actorId = actor.type === "USER" ? actor.userId : null;
  const isAssignee = actorId !== null && handoff.assignments.some((a) => a.assignedUserId === actorId);
  if (!isAssignee) {
    await assertActorCan(actor, "acquisition.handoff.acknowledge", { serviceLine: handoff.deal.serviceLine, ownerId: actorId });
  }
  if (actorId === null) throw new AppError("FORBIDDEN", "A handoff is acknowledged by its assignee.");
  const now = clockNow(clock);
  await withTransaction(async (tx) => {
    await repo.acknowledgeHandoff(tx, handoffId, actorId, now);
    await audit.record(tx, { actor, action: "acquisition.handoff.acknowledge", targetType: HANDOFF_TARGET, targetId: handoffId, after: { status: "ACKNOWLEDGED" } });
  });
}

export async function exportHandoff(actor: Actor, handoffId: string): Promise<{ fileKey: string; markdown: string }> {
  const handoff = await repo.getHandoffWithDeal(handoffId);
  if (handoff === null) throw new AppError("NOT_FOUND", "That handoff doesn't exist.");
  const actorId = actor.type === "USER" ? actor.userId : null;
  const isAssignee = actorId !== null && handoff.assignments.some((a) => a.assignedUserId === actorId);
  if (!isAssignee) {
    await assertActorCan(actor, "acquisition.handoff.assign", { serviceLine: handoff.deal.serviceLine });
  }

  const content = handoff.content as HandoffContent;
  const markdown = handoff.markdown ?? handoffToMarkdown(content);
  const ref = `HND-${handoff.id.slice(-6).toUpperCase()}`;

  const { renderHandoffPdf } = await import("./handoff-pdf");
  const buffer = await renderHandoffPdf(content, ref);
  const stored = await putFile({
    key: `acquisition/handoffs/${handoff.id}/${ref}.pdf`,
    body: buffer,
    contentType: "application/pdf",
    access: "PRIVATE",
    purpose: "HANDOFF_PDF",
    module: "acquisition",
    originalFilename: `${ref}.pdf`,
    ...(actorId === null ? {} : { uploaderId: actorId }),
  });
  await repo.setHandoffPdf(handoff.id, stored.id);
  if (handoff.markdown === null) await repo.setHandoffMarkdown(handoff.id, markdown);
  return { fileKey: stored.key, markdown };
}

/** Daily job: move lost leads whose re-engagement date has arrived to NURTURE and notify owners. */
export async function releaseDueReengagements(now: Date): Promise<{ released: number }> {
  const due = await repo.listDueReengagements(now);
  const actor: Actor = { type: "SYSTEM", job: "acquisition.pipeline.reengage" };
  let released = 0;
  for (const item of due) {
    try {
      const scope = await repo.getLeadScope(item.leadId);
      if (scope === null) continue;
      if (scope.status !== "LOST") continue;
      await withTransaction(async (tx) => {
        const transition = await transitionLead(tx, { leadId: item.leadId, to: "NURTURE", actor, reason: "reengage", nurtureReason: "REENGAGE", clock: { now: () => now } });
        await publishStatusChanged(tx, actor, transition.event, { leadId: item.leadId, serviceLine: scope.serviceLine, market: scope.market }, "reengage");
      });
      if (item.ownerId !== null) {
        await notifySafe({
          userIds: [item.ownerId],
          type: PIPELINE_NOTIFICATION_TYPES.leadReengageDue,
          title: "A lost lead is back in nurture",
          dedupeKey: `lead.reengage-due:${item.leadId}:${now.toISOString().slice(0, 10)}`,
        });
      }
      released += 1;
    } catch (error) {
      pipelineLog.error("re-engagement failed", { leadId: item.leadId, error: error instanceof Error ? error.message : "error" });
    }
  }
  return { released };
}
