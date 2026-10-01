/**
 * Pipeline board services (module spec §3.13 "Pipeline"). The board by stage with per-currency
 * totals (never summed across currencies, INV-11), moves with their required payloads, next
 * actions, manual nurture/re-engage, and the daily stale check. Moves that create deals or meetings
 * delegate to the deals and meetings services; everything goes through `transitionLead` (INV-15).
 */

import "server-only";

import type { Actor, Clock, Currency, LeadStatus, LostReason, Market, MoneyByCurrency, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

import { transitionLead } from "@/modules/acquisition/core";

import { stopEnrollments } from "../_seams";
import { markLost, markWon } from "../deals/deals";
import { createMeeting } from "../meetings/meetings";
import * as repo from "../pipeline.repo";
import { PIPELINE_NOTIFICATION_TYPES } from "../notifications";
import { getProfileContext, typicalMidpointMinor } from "../profile-context";
import { getStaleDaysByStage } from "../settings";
import { notifySafe, pipelineLog, publishStatusChanged } from "../shared";

const DAY_MS = 24 * 60 * 60 * 1000;

function clockNow(clock?: Clock): Date {
  return (clock ?? { now: () => new Date() }).now();
}

const COLUMN_ORDER: readonly LeadStatus[] = ["CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST"];

export interface PipelineCard {
  leadId: string;
  status: LeadStatus;
  companyName: string;
  contactName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  market: Market;
  daysInStage: number;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  overdue: boolean;
  stale: boolean;
  estimatedValue: { amountMinor: number; currency: Currency } | null;
}

export interface PipelineColumn {
  status: LeadStatus;
  collapsed: boolean;
  cards: PipelineCard[];
  count: number;
  totalsByCurrency: MoneyByCurrency;
}

export interface PipelineBoard {
  serviceLine: ServiceLine;
  columns: PipelineColumn[];
  nurture: PipelineColumn;
}

export interface PipelineQuery {
  serviceLine: ServiceLine;
  market?: Market;
  ownerId?: string;
  from?: Date;
  to?: Date;
}

export async function getPipeline(actor: Actor, query: PipelineQuery, clock?: Clock): Promise<PipelineBoard> {
  await assertActorCan(actor, "acquisition.pipeline.read", { serviceLine: query.serviceLine });
  const now = clockNow(clock);
  const rows = await repo.listPipelineLeads(query);

  // Typical-package midpoint per market, for cards without a proposal (lazy, per market present).
  const midpoints = new Map<Market, number | null>();
  async function midpointFor(market: Market): Promise<number | null> {
    const cached = midpoints.get(market);
    if (cached !== undefined) return cached;
    const context = await getProfileContext(query.serviceLine, market, null);
    const value = typicalMidpointMinor(context.packages);
    midpoints.set(market, value);
    return value;
  }

  const cards: PipelineCard[] = [];
  for (const row of rows) {
    let estimatedValue: PipelineCard["estimatedValue"] = null;
    if (row.latestProposalTotalMinor !== null && row.latestProposalCurrency !== null) {
      estimatedValue = { amountMinor: row.latestProposalTotalMinor, currency: row.latestProposalCurrency };
    } else {
      const midpoint = await midpointFor(row.market);
      if (midpoint !== null) {
        estimatedValue = { amountMinor: midpoint, currency: row.market === "NIGERIA" ? "NGN" : "USD" };
      }
    }
    cards.push({
      leadId: row.id,
      status: row.status,
      companyName: row.companyName,
      contactName: row.contactName,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      market: row.market,
      daysInStage: Math.floor((now.getTime() - row.lastActivityAt.getTime()) / DAY_MS),
      nextActionAt: row.nextActionAt,
      nextActionNote: row.nextActionNote,
      overdue: row.nextActionAt !== null && row.nextActionAt.getTime() <= now.getTime(),
      stale: row.staleFlaggedAt !== null,
      estimatedValue,
    });
  }

  const columns = COLUMN_ORDER.map((status) => buildColumn(status, cards, status === "CONTACTED"));
  const nurture = buildColumn("NURTURE", cards, false);
  return { serviceLine: query.serviceLine, columns, nurture };
}

function buildColumn(status: LeadStatus, cards: PipelineCard[], collapsed: boolean): PipelineColumn {
  const columnCards = cards.filter((c) => c.status === status);
  const totalsByCurrency: MoneyByCurrency = {};
  for (const card of columnCards) {
    if (card.estimatedValue === null) continue;
    const { currency, amountMinor } = card.estimatedValue;
    totalsByCurrency[currency] = (totalsByCurrency[currency] ?? 0) + amountMinor;
  }
  return { status, collapsed, cards: columnCards, count: columnCards.length, totalsByCurrency };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export type MoveLeadInput =
  | { to: "LOST"; reason: LostReason; competitor?: string | null; note?: string | null; reengageAt?: Date | null }
  | { to: "WON"; valueMinor: number; currency: Currency; services: ServiceLine[]; proposalId?: string | null; startDate?: Date | null }
  | { to: "MEETING_BOOKED"; startsAt: Date; endsAt: Date; location?: string | null; notes?: string | null }
  | { to: "NURTURE"; until: Date; note?: string | null }
  | { to: "PROPOSAL_SENT" }
  | { to: "REPLIED" };

export async function moveLead(actor: Actor, leadId: string, input: MoveLeadInput, clock?: Clock): Promise<void> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.pipeline.move", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });

  switch (input.to) {
    case "WON":
      await markWon(actor, leadId, { valueMinor: input.valueMinor, currency: input.currency, services: input.services, proposalId: input.proposalId ?? null, startDate: input.startDate ?? null }, clock);
      return;
    case "LOST":
      await markLost(actor, leadId, { reason: input.reason, competitor: input.competitor ?? null, note: input.note ?? null, reengageAt: input.reengageAt ?? null }, clock);
      return;
    case "MEETING_BOOKED":
      await createMeeting(actor, leadId, { startsAt: input.startsAt, endsAt: input.endsAt, location: input.location ?? null, notes: input.notes ?? null }, clock);
      return;
    case "PROPOSAL_SENT":
      // A proposal must be created and sent through the proposal flow (AC-32.3).
      throw new AppError("CONFLICT", "Create and send a proposal to move a lead to Proposal sent.");
    case "NURTURE":
      await nurtureLead(actor, leadId, { until: input.until, note: input.note ?? null }, clock);
      return;
    case "REPLIED":
      await directTransition(actor, scope, "REPLIED", "move:replied", clockNow(clock));
      return;
  }
}

async function directTransition(actor: Actor, scope: repo.LeadScope, to: LeadStatus, reason: string, now: Date): Promise<void> {
  await withTransaction(async (tx) => {
    const result = await transitionLead(tx, { leadId: scope.id, to, actor, reason, clock: { now: () => now } });
    await audit.record(tx, { actor, action: "acquisition.pipeline.move", targetType: "acquisition.lead", targetId: scope.id, after: { to } });
    await publishStatusChanged(tx, actor, result.event, { leadId: scope.id, serviceLine: scope.serviceLine, market: scope.market }, reason);
  });
}

// ---------------------------------------------------------------------------
// Next actions
// ---------------------------------------------------------------------------

export async function setNextAction(
  actor: Actor,
  leadId: string,
  input: { at: Date | null; note?: string | null },
): Promise<void> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.update", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  await withTransaction(async (tx) => {
    await repo.setNextAction(tx, leadId, input.at, input.note ?? null);
    await audit.record(tx, { actor, action: "acquisition.lead.update", targetType: "acquisition.lead", targetId: leadId, after: { nextActionAt: input.at?.toISOString() ?? null } });
  });
}

export async function getOverdueNextActions(actor: Actor, clock?: Clock): Promise<repo.OverdueNextAction[]> {
  if (actor.type !== "USER") return [];
  return repo.listOverdueNextActions(actor.userId, clockNow(clock));
}

// ---------------------------------------------------------------------------
// Manual nurture / re-engage
// ---------------------------------------------------------------------------

export async function nurtureLead(
  actor: Actor,
  leadId: string,
  input: { until: Date; note?: string | null },
  clock?: Clock,
): Promise<void> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.update", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  const now = clockNow(clock);
  await withTransaction(async (tx) => {
    const result = await transitionLead(tx, { leadId, to: "NURTURE", actor, reason: "nurture:manual", nurtureReason: "MANUAL", clock: { now: () => now } });
    await repo.setNextAction(tx, leadId, input.until, input.note ?? null);
    await stopEnrollments(tx, { companyId: scope.companyId }, "MANUAL");
    await audit.record(tx, { actor, action: "acquisition.lead.update", targetType: "acquisition.lead", targetId: leadId, after: { to: "NURTURE", until: input.until.toISOString() } });
    await publishStatusChanged(tx, actor, result.event, { leadId, serviceLine: scope.serviceLine, market: scope.market }, "nurture:manual");
  });
}

export async function reengageLead(actor: Actor, leadId: string, clock?: Clock): Promise<void> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.update", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  await directTransition(actor, scope, "REPLIED", "reengage:manual", clockNow(clock));
}

// ---------------------------------------------------------------------------
// Stale check (daily job)
// ---------------------------------------------------------------------------

export async function runStaleCheck(now: Date): Promise<{ flagged: number }> {
  const staleDays = await getStaleDaysByStage();
  const cutoffs = Object.entries(staleDays)
    .filter(([status]) => COLUMN_ORDER.includes(status as LeadStatus) && status !== "WON" && status !== "LOST")
    .map(([status, days]) => ({ status: status as LeadStatus, before: new Date(now.getTime() - days * DAY_MS) }));
  const candidates = await repo.listStaleCandidates(cutoffs);
  let flagged = 0;
  for (const lead of candidates) {
    try {
      await repo.markLeadStale(lead.id, now);
      if (lead.ownerId !== null) {
        await notifySafe({
          userIds: [lead.ownerId],
          type: PIPELINE_NOTIFICATION_TYPES.leadStale,
          title: `A lead has gone stale: ${lead.companyName}`,
          dedupeKey: `lead.stale:${lead.id}:${now.toISOString().slice(0, 10)}`,
        });
      }
      flagged += 1;
    } catch (error) {
      pipelineLog.error("stale flag failed", { leadId: lead.id, error: error instanceof Error ? error.message : "error" });
    }
  }
  return { flagged };
}
