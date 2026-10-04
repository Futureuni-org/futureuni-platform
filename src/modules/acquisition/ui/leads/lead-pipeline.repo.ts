import "server-only";

/**
 * Lead-scoped reads the lead-detail tabs need and that no service exposes yet: a lead's meetings,
 * its proposals (every version, with line items), its deal and handoff, and the structured evidence
 * behind each finding. `@/modules/acquisition/pipeline` exports only mutations plus the board read,
 * and `getAuditsForLead` omits a finding's `evidence` and dismiss reason. See CR-16-GAP-PIPELINE-READS
 * and CR-16-GAP-FINDING-EVIDENCE in phases/16/REQUESTS.md. The page authorises the lead before
 * calling any of these.
 */

import { db, type Prisma } from "@/platform/db";

export function listLeadMeetings(leadId: string) {
  return db.meeting.findMany({
    where: { leadId },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      source: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      location: true,
      videoUrl: true,
      attendeeName: true,
      notes: true,
      outcomeNotes: true,
      summary: true,
      precallBrief: true,
      precallGeneratedAt: true,
    },
  });
}

export function listLeadProposals(leadId: string) {
  return db.proposal.findMany({
    where: { leadId },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    take: 50,
    select: {
      id: true,
      proposalGroupId: true,
      version: true,
      status: true,
      currency: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
      totalMinor: true,
      validUntil: true,
      discountType: true,
      discountValue: true,
      notes: true,
      requiresApproval: true,
      approvalReason: true,
      sentAt: true,
      declineReason: true,
      sections: true,
      createdAt: true,
      pdfFile: { select: { key: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          packageId: true,
          description: true,
          quantity: true,
          unitPriceMinor: true,
          totalMinor: true,
        },
      },
    },
  });
}

/** A lead's live proposals (id, version, status), for pickers that only need to name one. */
export function listLeadProposalRefs(leadId: string) {
  return db.proposal.findMany({
    where: { leadId, status: { notIn: ["SUPERSEDED", "EXPIRED", "DECLINED"] } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    take: 20,
    select: { id: true, version: true, status: true },
  });
}

export function getLeadDeal(leadId: string) {
  return db.deal.findUnique({
    where: { leadId },
    select: {
      id: true,
      outcome: true,
      valueMinor: true,
      currency: true,
      services: true,
      startDate: true,
      notes: true,
      lostReason: true,
      competitor: true,
      lostNote: true,
      reengageAt: true,
      closedAt: true,
      handoff: {
        select: {
          id: true,
          status: true,
          acknowledgedAt: true,
          content: true,
          assignments: {
            where: { active: true },
            orderBy: { serviceLine: "asc" },
            select: {
              serviceLine: true,
              suggestedUser: { select: { id: true, name: true } },
              assignedUser: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

/** The structured evidence and dismiss reason for every finding on a lead, keyed by finding id. */
export async function getFindingExtras(
  leadId: string,
): Promise<Map<string, { evidence: Prisma.JsonValue; dismissReason: string | null }>> {
  const rows = await db.auditFinding.findMany({
    where: { leadId },
    select: { id: true, evidence: true, dismissReason: true },
  });
  return new Map(rows.map((r) => [r.id, { evidence: r.evidence, dismissReason: r.dismissReason }]));
}

/** Claims for a set of finding ids (the brief's key findings), skipping dismissed ones. */
export function getFindingClaims(findingIds: string[]) {
  if (findingIds.length === 0) return Promise.resolve([]);
  return db.auditFinding.findMany({
    where: { id: { in: findingIds }, dismissedAt: null },
    select: { id: true, claim: true, severity: true },
  });
}

/**
 * The lead fields the quote builder prices against. The country is the company's, because that is
 * what `createProposal` resolves the price book from; a preview priced from the lead's own country
 * could show one currency and save another.
 */
export async function getLeadPricingScope(leadId: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      serviceLine: true,
      market: true,
      ownerId: true,
      company: { select: { country: true } },
    },
  });
  if (lead === null) return null;
  return {
    serviceLine: lead.serviceLine,
    market: lead.market,
    ownerId: lead.ownerId,
    country: lead.company.country,
  };
}
