/**
 * Factories for the pipeline: meetings, proposals and their line items, deals, handoffs and
 * handoff assignments. Money is integer minor units plus a currency (INV-11).
 */

import type {
  Deal,
  Handoff,
  HandoffAssignment,
  Meeting,
  Prisma,
  Proposal,
  ProposalLineItem,
  Tx,
} from "@/platform/db";

import { createLeadInStatus } from "./acquisition-leads";
import { createUser } from "./core";
import { FIXED_NOW, daysAgo, uniqueToken } from "./sequence";

type Input<T> = Partial<T>;

/**
 * A meeting tomorrow at 10:00 UTC for a new MEETING_BOOKED lead. Pass `leadId: null` for an
 * UNMATCHED booking with no lead.
 */
export async function createMeeting(
  tx: Tx,
  overrides: Input<Prisma.MeetingUncheckedCreateInput> = {},
): Promise<Meeting> {
  const lead =
    overrides.leadId === null
      ? null
      : overrides.leadId === undefined
        ? await createLeadInStatus(tx, "MEETING_BOOKED")
        : await tx.lead.findUniqueOrThrow({ where: { id: overrides.leadId } });
  const startsAt =
    overrides.startsAt === undefined
      ? new Date(FIXED_NOW.getTime() + 25 * 3_600_000)
      : new Date(overrides.startsAt);
  return tx.meeting.create({
    data: {
      source: "MANUAL",
      status: "SCHEDULED",
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      timezone: "Africa/Lagos",
      ...overrides,
      ...(lead === null ? { status: overrides.status ?? "UNMATCHED" } : {}),
      startsAt,
      leadId: lead?.id ?? null,
      companyId: overrides.companyId ?? lead?.companyId ?? null,
    },
  });
}

/** A DRAFT NGN proposal (₦900,000) with totals that add up. Its group id is its own id. */
export async function createProposal(
  tx: Tx,
  overrides: Input<Prisma.ProposalUncheckedCreateInput> = {},
): Promise<Proposal> {
  const leadId = overrides.leadId ?? (await createLeadInStatus(tx, "MEETING_BOOKED")).id;
  const createdById = overrides.createdById ?? (await createUser(tx, { role: "SERVICE_LEAD" })).id;
  const proposal = await tx.proposal.create({
    data: {
      // Replaced by the proposal's own id below; unique meanwhile, so parallel tests never wait.
      proposalGroupId: overrides.proposalGroupId ?? `pending-${uniqueToken()}`,
      currency: "NGN",
      packages: [
        {
          packageId: "web_starter",
          name: "Starter site",
          quantity: 1,
          unitPriceMinor: 90_000_000,
          currency: "NGN",
          withinRange: true,
        },
      ],
      subtotalMinor: 90_000_000,
      totalMinor: 90_000_000,
      validUntil: new Date("2026-10-31T00:00:00.000Z"),
      ...overrides,
      leadId,
      createdById,
    },
  });
  if (overrides.proposalGroupId !== undefined) return proposal;
  return tx.proposal.update({ where: { id: proposal.id }, data: { proposalGroupId: proposal.id } });
}

export async function createProposalLineItem(
  tx: Tx,
  overrides: Input<Prisma.ProposalLineItemUncheckedCreateInput> = {},
): Promise<ProposalLineItem> {
  const proposalId = overrides.proposalId ?? (await createProposal(tx)).id;
  return tx.proposalLineItem.create({
    data: {
      packageId: "web_starter",
      description: "Starter site: up to 5 responsive pages",
      quantity: 1,
      unitPriceMinor: 90_000_000,
      totalMinor: 90_000_000,
      ...overrides,
      proposalId,
    },
  });
}

/** A WON NGN deal on a new WON lead. For LOST, pass outcome "LOST" with a lostReason. */
export async function createDeal(
  tx: Tx,
  overrides: Input<Prisma.DealUncheckedCreateInput> = {},
): Promise<Deal> {
  const lead =
    overrides.leadId === undefined
      ? await createLeadInStatus(tx, overrides.outcome === "LOST" ? "LOST" : "WON")
      : await tx.lead.findUniqueOrThrow({ where: { id: overrides.leadId } });
  const closedById = overrides.closedById ?? (await createUser(tx, { role: "SERVICE_LEAD" })).id;
  const won = (overrides.outcome ?? "WON") === "WON";
  return tx.deal.create({
    data: {
      serviceLine: lead.serviceLine,
      market: lead.market,
      outcome: "WON",
      ...(won
        ? { valueMinor: 185_000_000, currency: "NGN" as const, services: [lead.serviceLine] }
        : { lostReason: "PRICE" as const }),
      closedAt: daysAgo(1),
      ...overrides,
      leadId: lead.id,
      companyId: overrides.companyId ?? lead.companyId,
      closedById,
    },
  });
}

export async function createHandoff(
  tx: Tx,
  overrides: Input<Prisma.HandoffUncheckedCreateInput> = {},
): Promise<Handoff> {
  const deal =
    overrides.dealId === undefined
      ? await createDeal(tx)
      : await tx.deal.findUniqueOrThrow({ where: { id: overrides.dealId } });
  return tx.handoff.create({
    data: {
      status: "NEW",
      content: {
        company: {
          id: deal.companyId,
          name: "Test company",
          website: null,
          country: "NG",
          city: "Lagos",
        },
        contacts: [],
        market: deal.market,
        services: deal.services.length > 0 ? deal.services : [deal.serviceLine],
        scope: ["Up to 5 responsive pages"],
        timeline: { startDate: null, notes: "" },
        value: { amountMinor: deal.valueMinor ?? 0, currency: deal.currency ?? "NGN" },
        paymentNotes: "50% upfront",
        keyFindings: [],
        meetingSummaries: [],
        files: [],
        proposalId: deal.proposalId,
        snapshotAt: FIXED_NOW.toISOString(),
      },
      ...overrides,
      dealId: deal.id,
      companyId: overrides.companyId ?? deal.companyId,
    },
  });
}

export async function createHandoffAssignment(
  tx: Tx,
  overrides: Input<Prisma.HandoffAssignmentUncheckedCreateInput> = {},
): Promise<HandoffAssignment> {
  const handoffId = overrides.handoffId ?? (await createHandoff(tx)).id;
  return tx.handoffAssignment.create({
    data: {
      serviceLine: "WEB_DEVELOPMENT",
      active: true,
      assignedAt: FIXED_NOW,
      ...overrides,
      handoffId,
    },
  });
}
