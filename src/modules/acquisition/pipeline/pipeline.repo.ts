/**
 * All database access for the pipeline area (meetings, proposals, deals, handoff, board, notes and
 * the revenue aggregates). Per CLAUDE.md §Conventions, Prisma access lives only in `*.repo.ts`.
 *
 * Functions that must join a caller's transaction take `tx: Tx` first; standalone reads use the
 * root `db` client. JSON columns go through `toJsonInput`.
 */

import "server-only";

import type {
  Currency,
  EnrollmentStopReason,
  JsonValue,
  LeadStatus,
  LostReason,
  Market,
  NurtureReason,
  ServiceLine,
} from "@/contracts/common";
import {
  db,
  Prisma,
  toJsonInput,
  type Deal,
  type Handoff,
  type Meeting,
  type Proposal,
  type Tx,
} from "@/platform/db";

// ---------------------------------------------------------------------------
// Lead scope + brief
// ---------------------------------------------------------------------------

export interface LeadScope {
  id: string;
  serviceLine: ServiceLine;
  market: Market;
  ownerId: string | null;
  companyId: string;
  primaryContactId: string | null;
  status: LeadStatus;
  nurtureReason: NurtureReason | null;
  firstContactedAt: Date | null;
  lastActivityAt: Date;
}

export async function getLeadScope(leadId: string): Promise<LeadScope | null> {
  return db.lead.findFirst({
    where: { id: leadId },
    select: {
      id: true,
      serviceLine: true,
      market: true,
      ownerId: true,
      companyId: true,
      primaryContactId: true,
      status: true,
      nurtureReason: true,
      firstContactedAt: true,
      lastActivityAt: true,
    },
  });
}

export interface LeadBriefFields {
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  score: number | null;
  scoreReasons: unknown;
}

export async function getLeadBriefFields(leadId: string): Promise<LeadBriefFields | null> {
  return db.lead.findFirst({
    where: { id: leadId },
    select: { brief: true, keyFindingIds: true, suggestedAngleId: true, score: true, scoreReasons: true },
  });
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface PipelineCardRow {
  id: string;
  status: LeadStatus;
  serviceLine: ServiceLine;
  market: Market;
  ownerId: string | null;
  ownerName: string | null;
  companyName: string;
  contactName: string | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  staleFlaggedAt: Date | null;
  lastActivityAt: Date;
  nurtureReason: NurtureReason | null;
  latestProposalTotalMinor: number | null;
  latestProposalCurrency: Currency | null;
}

export interface PipelineQuery {
  serviceLine: ServiceLine;
  market?: Market;
  ownerId?: string;
  from?: Date;
  to?: Date;
}

const BOARD_STATUSES: readonly LeadStatus[] = [
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "NURTURE",
];

export async function listPipelineLeads(query: PipelineQuery): Promise<PipelineCardRow[]> {
  const where: Prisma.LeadWhereInput = {
    serviceLine: query.serviceLine,
    status: { in: [...BOARD_STATUSES] },
    ...(query.market === undefined ? {} : { market: query.market }),
    ...(query.ownerId === undefined ? {} : { ownerId: query.ownerId }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          lastActivityAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to }),
          },
        }),
  };

  const leads = await db.lead.findMany({
    where,
    select: {
      id: true,
      status: true,
      serviceLine: true,
      market: true,
      ownerId: true,
      nextActionAt: true,
      nextActionNote: true,
      staleFlaggedAt: true,
      lastActivityAt: true,
      nurtureReason: true,
      owner: { select: { name: true } },
      company: { select: { name: true } },
      primaryContact: { select: { name: true } },
      proposals: {
        where: { status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { totalMinor: true, currency: true },
      },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return leads.map((lead) => {
    const latest = lead.proposals[0];
    return {
      id: lead.id,
      status: lead.status,
      serviceLine: lead.serviceLine,
      market: lead.market,
      ownerId: lead.ownerId,
      ownerName: lead.owner?.name ?? null,
      companyName: lead.company.name,
      contactName: lead.primaryContact?.name ?? null,
      nextActionAt: lead.nextActionAt,
      nextActionNote: lead.nextActionNote,
      staleFlaggedAt: lead.staleFlaggedAt,
      lastActivityAt: lead.lastActivityAt,
      nurtureReason: lead.nurtureReason,
      latestProposalTotalMinor: latest?.totalMinor ?? null,
      latestProposalCurrency: latest?.currency ?? null,
    };
  });
}

export async function setNextAction(
  tx: Tx,
  leadId: string,
  at: Date | null,
  note: string | null,
): Promise<void> {
  await tx.lead.update({
    where: { id: leadId },
    data: { nextActionAt: at, nextActionNote: note },
  });
}

export interface OverdueNextAction {
  leadId: string;
  serviceLine: ServiceLine;
  companyName: string;
  nextActionAt: Date;
  nextActionNote: string | null;
}

export async function listOverdueNextActions(userId: string, now: Date): Promise<OverdueNextAction[]> {
  const leads = await db.lead.findMany({
    where: {
      ownerId: userId,
      status: { in: [...BOARD_STATUSES] },
      nextActionAt: { lte: now, not: null },
    },
    select: {
      id: true,
      serviceLine: true,
      nextActionAt: true,
      nextActionNote: true,
      company: { select: { name: true } },
    },
    orderBy: { nextActionAt: "asc" },
  });
  return leads.map((l) => ({
    leadId: l.id,
    serviceLine: l.serviceLine,
    companyName: l.company.name,
    nextActionAt: l.nextActionAt ?? now,
    nextActionNote: l.nextActionNote,
  }));
}

export interface StaleCandidate {
  id: string;
  status: LeadStatus;
  ownerId: string | null;
  serviceLine: ServiceLine;
  companyName: string;
  lastActivityAt: Date;
}

/** Open board leads whose last activity is before the given cutoff for their stage and not yet flagged. */
export async function listStaleCandidates(
  cutoffByStatus: readonly { status: LeadStatus; before: Date }[],
): Promise<StaleCandidate[]> {
  if (cutoffByStatus.length === 0) return [];
  const leads = await db.lead.findMany({
    where: {
      staleFlaggedAt: null,
      OR: cutoffByStatus.map(({ status, before }) => ({ status, lastActivityAt: { lt: before } })),
    },
    select: {
      id: true,
      status: true,
      ownerId: true,
      serviceLine: true,
      lastActivityAt: true,
      company: { select: { name: true } },
    },
  });
  return leads.map((l) => ({
    id: l.id,
    status: l.status,
    ownerId: l.ownerId,
    serviceLine: l.serviceLine,
    companyName: l.company.name,
    lastActivityAt: l.lastActivityAt,
  }));
}

export async function markLeadStale(leadId: string, at: Date): Promise<void> {
  await db.lead.update({ where: { id: leadId }, data: { staleFlaggedAt: at } });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function createNote(
  tx: Tx,
  input: {
    authorId: string;
    targetType: string;
    targetId: string;
    companyId: string | null;
    body: string;
    mentions: string[];
  },
): Promise<{ id: string }> {
  const row = await tx.note.create({
    data: {
      authorId: input.authorId,
      module: "acquisition",
      targetType: input.targetType,
      targetId: input.targetId,
      companyId: input.companyId,
      body: input.body,
      mentions: input.mentions,
    },
    select: { id: true },
  });
  return row;
}

export interface NoteRow {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: Date;
}

export async function listNotes(targetType: string, targetId: string): Promise<NoteRow[]> {
  const rows = await db.note.findMany({
    where: { module: "acquisition", targetType, targetId },
    select: { id: true, authorId: true, body: true, mentions: true, createdAt: true, author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorName: r.author.name,
    body: r.body,
    mentions: r.mentions,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export interface CreateMeetingData {
  leadId: string | null;
  companyId: string | null;
  contactId: string | null;
  ownerId: string | null;
  source: "CAL_COM" | "GOOGLE_CALENDAR" | "MANUAL";
  externalId: string | null;
  status: "SCHEDULED" | "UNMATCHED";
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  videoUrl: string | null;
  attendeeEmail: string | null;
  attendeeName: string | null;
  notes: string | null;
}

export async function createMeeting(tx: Tx, data: CreateMeetingData): Promise<Meeting> {
  return tx.meeting.create({ data });
}

export async function findMeetingByExternalId(
  source: "CAL_COM" | "GOOGLE_CALENDAR",
  externalId: string,
): Promise<Meeting | null> {
  return db.meeting.findFirst({ where: { source, externalId } });
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  return db.meeting.findFirst({ where: { id: meetingId } });
}

export async function updateMeeting(
  tx: Tx,
  meetingId: string,
  data: Prisma.MeetingUncheckedUpdateInput,
): Promise<Meeting> {
  return tx.meeting.update({ where: { id: meetingId }, data });
}

export async function setPrecallBrief(
  meetingId: string,
  brief: unknown,
  aiCallId: string | null,
  now: Date,
): Promise<void> {
  await db.meeting.update({
    where: { id: meetingId },
    data: { precallBrief: toJsonInput(brief), precallGeneratedAt: now, precallAiCallId: aiCallId },
  });
}

export async function setMeetingSummary(
  tx: Tx,
  meetingId: string,
  summary: unknown,
  aiCallId: string | null,
): Promise<void> {
  await tx.meeting.update({
    where: { id: meetingId },
    data: { summary: toJsonInput(summary), summaryAiCallId: aiCallId },
  });
}

/** SCHEDULED meetings starting within [now, now+leadMs] that have no pre-call brief yet. */
export async function listMeetingsNeedingPrecall(now: Date, leadMs: number): Promise<Meeting[]> {
  return db.meeting.findMany({
    where: {
      status: "SCHEDULED",
      precallGeneratedAt: null,
      leadId: { not: null },
      startsAt: { gt: now, lte: new Date(now.getTime() + leadMs) },
    },
  });
}

/** SCHEDULED meetings whose owner is due a reminder at one of the offsets before the start. */
export async function listMeetingsForReminders(now: Date, windowMs: number): Promise<Meeting[]> {
  return db.meeting.findMany({
    where: {
      status: "SCHEDULED",
      ownerId: { not: null },
      startsAt: { gt: now, lte: new Date(now.getTime() + windowMs) },
    },
  });
}

export async function markReminderSent(
  meetingId: string,
  which: "reminder24hSentAt" | "reminder1hSentAt",
  at: Date,
): Promise<void> {
  await db.meeting.update({ where: { id: meetingId }, data: { [which]: at } });
}

export async function listMeetingSummariesForLead(
  leadId: string,
): Promise<{ id: string; summary: unknown }[]> {
  const rows = await db.meeting.findMany({
    where: { leadId, summary: { not: Prisma.DbNull } },
    select: { id: true, summary: true },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, summary: r.summary }));
}

// ---------------------------------------------------------------------------
// Contacts (for unmatched-booking linking)
// ---------------------------------------------------------------------------

export interface ContactMatch {
  contactId: string;
  companyId: string;
  leadId: string | null;
  serviceLine: ServiceLine | null;
  ownerId: string | null;
}

/** Finds a live contact by email and its most recent open lead, for matching an unmatched booking. */
export async function findContactByEmail(email: string): Promise<ContactMatch | null> {
  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    select: {
      id: true,
      companyId: true,
      primaryOfLeads: {
        where: { status: { in: ["CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "NURTURE"] } },
        orderBy: { lastActivityAt: "desc" },
        take: 1,
        select: { id: true, serviceLine: true, ownerId: true },
      },
    },
  });
  if (contact === null) return null;
  const lead = contact.primaryOfLeads[0];
  return {
    contactId: contact.id,
    companyId: contact.companyId,
    leadId: lead?.id ?? null,
    serviceLine: lead?.serviceLine ?? null,
    ownerId: lead?.ownerId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export interface CreateProposalData {
  leadId: string;
  proposalGroupId: string | null; // null → new group (use the row's own id)
  version: number;
  currency: Currency;
  packages: unknown;
  discountType: "NONE" | "PERCENT" | "AMOUNT";
  discountValue: number;
  subtotalMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
  validUntil: Date;
  sections: unknown;
  notes: string | null;
  requiresApproval: boolean;
  approvalReason: string | null;
  aiCallId: string | null;
  createdById: string;
  lineItems: {
    packageId: string | null;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
    sortOrder: number;
  }[];
}

export type ProposalWithLines = Proposal & {
  lineItems: {
    id: string;
    packageId: string | null;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
    sortOrder: number;
  }[];
};

export async function createProposal(tx: Tx, data: CreateProposalData): Promise<ProposalWithLines> {
  const created = await tx.proposal.create({
    data: {
      leadId: data.leadId,
      // proposalGroupId must reference the first version's id; set below when null.
      proposalGroupId: data.proposalGroupId ?? "pending",
      version: data.version,
      status: data.requiresApproval ? "PENDING_APPROVAL" : "DRAFT",
      currency: data.currency,
      packages: toJsonInput(data.packages),
      discountType: data.discountType,
      discountValue: data.discountValue,
      subtotalMinor: data.subtotalMinor,
      discountMinor: data.discountMinor,
      taxRateBps: data.taxRateBps,
      taxMinor: data.taxMinor,
      totalMinor: data.totalMinor,
      validUntil: data.validUntil,
      sections: data.sections === null ? Prisma.DbNull : toJsonInput(data.sections),
      notes: data.notes,
      requiresApproval: data.requiresApproval,
      approvalReason: data.approvalReason,
      aiCallId: data.aiCallId,
      createdById: data.createdById,
      lineItems: { create: data.lineItems },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (data.proposalGroupId === null) {
    return tx.proposal.update({
      where: { id: created.id },
      data: { proposalGroupId: created.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  }
  return created;
}

export async function getProposal(proposalId: string): Promise<ProposalWithLines | null> {
  return db.proposal.findFirst({
    where: { id: proposalId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function getProposalWithLead(
  proposalId: string,
): Promise<(ProposalWithLines & { lead: LeadScope }) | null> {
  const proposal = await db.proposal.findFirst({
    where: { id: proposalId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      lead: {
        select: {
          id: true,
          serviceLine: true,
          market: true,
          ownerId: true,
          companyId: true,
          primaryContactId: true,
          status: true,
          nurtureReason: true,
          firstContactedAt: true,
          lastActivityAt: true,
        },
      },
    },
  });
  return proposal;
}

export async function listProposalVersions(proposalGroupId: string): Promise<ProposalWithLines[]> {
  return db.proposal.findMany({
    where: { proposalGroupId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    orderBy: { version: "asc" },
  });
}

export async function getLatestVersion(proposalGroupId: string): Promise<number> {
  const latest = await db.proposal.findFirst({
    where: { proposalGroupId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return latest?.version ?? 0;
}

export async function supersedeProposal(tx: Tx, proposalId: string): Promise<void> {
  await tx.proposal.update({ where: { id: proposalId }, data: { status: "SUPERSEDED" } });
}

export async function updateProposal(
  tx: Tx,
  proposalId: string,
  data: Prisma.ProposalUncheckedUpdateInput,
): Promise<Proposal> {
  return tx.proposal.update({ where: { id: proposalId }, data });
}

export async function setProposalPdf(proposalId: string, fileId: string): Promise<void> {
  await db.proposal.update({ where: { id: proposalId }, data: { pdfFileId: fileId } });
}

/** Sent proposals whose validity has passed, for the expiry job. */
export async function listExpiredProposals(now: Date): Promise<{ id: string; leadId: string }[]> {
  return db.proposal.findMany({
    where: { status: "SENT", validUntil: { lt: now } },
    select: { id: true, leadId: true },
  });
}

// ---------------------------------------------------------------------------
// Deals + handoff
// ---------------------------------------------------------------------------

export interface CreateDealData {
  leadId: string;
  companyId: string;
  serviceLine: ServiceLine;
  market: Market;
  outcome: "WON" | "LOST";
  valueMinor: number | null;
  currency: Currency | null;
  services: ServiceLine[];
  packageIds: string[];
  proposalId: string | null;
  startDate: Date | null;
  notes: string | null;
  lostReason: LostReason | null;
  competitor: string | null;
  lostNote: string | null;
  reengageAt: Date | null;
  closedById: string;
}

export async function createDeal(tx: Tx, data: CreateDealData): Promise<Deal> {
  return tx.deal.create({
    data: {
      leadId: data.leadId,
      companyId: data.companyId,
      serviceLine: data.serviceLine,
      market: data.market,
      outcome: data.outcome,
      valueMinor: data.valueMinor,
      currency: data.currency,
      services: data.services,
      packageIds: data.packageIds,
      proposalId: data.proposalId,
      startDate: data.startDate,
      notes: data.notes,
      lostReason: data.lostReason,
      competitor: data.competitor,
      lostNote: data.lostNote,
      reengageAt: data.reengageAt,
      closedById: data.closedById,
    },
  });
}

export async function getDealByLead(leadId: string): Promise<Deal | null> {
  return db.deal.findFirst({ where: { leadId } });
}

export interface CreateHandoffData {
  dealId: string;
  companyId: string;
  content: unknown;
  markdown: string | null;
  assignments: { serviceLine: ServiceLine; suggestedUserId: string | null }[];
}

export type HandoffWithAssignments = Handoff & {
  assignments: {
    id: string;
    serviceLine: ServiceLine;
    suggestedUserId: string | null;
    assignedUserId: string | null;
    assignedById: string | null;
    assignedAt: Date | null;
    acknowledgedAt: Date | null;
    active: boolean;
  }[];
};

export async function createHandoff(tx: Tx, data: CreateHandoffData): Promise<HandoffWithAssignments> {
  return tx.handoff.create({
    data: {
      dealId: data.dealId,
      companyId: data.companyId,
      status: "NEW",
      content: toJsonInput(data.content),
      markdown: data.markdown,
      assignments: { create: data.assignments },
    },
    include: { assignments: true },
  });
}

export async function getHandoff(handoffId: string): Promise<HandoffWithAssignments | null> {
  return db.handoff.findFirst({ where: { id: handoffId }, include: { assignments: true } });
}

export async function getHandoffWithDeal(
  handoffId: string,
): Promise<(HandoffWithAssignments & { deal: Deal }) | null> {
  return db.handoff.findFirst({
    where: { id: handoffId },
    include: { assignments: true, deal: true },
  });
}

export async function assignHandoffLine(
  tx: Tx,
  handoffId: string,
  serviceLine: ServiceLine,
  assignedUserId: string,
  assignedById: string,
  at: Date,
): Promise<{ previousUserId: string | null }> {
  const existing = await tx.handoffAssignment.findFirst({
    where: { handoffId, serviceLine },
    select: { id: true, assignedUserId: true },
  });
  if (existing === null) {
    await tx.handoffAssignment.create({
      data: { handoffId, serviceLine, assignedUserId, assignedById, assignedAt: at, active: true },
    });
    return { previousUserId: null };
  }
  await tx.handoffAssignment.update({
    where: { id: existing.id },
    data: { assignedUserId, assignedById, assignedAt: at, acknowledgedAt: null, active: true },
  });
  return { previousUserId: existing.assignedUserId };
}

export async function setHandoffPdf(handoffId: string, fileId: string): Promise<void> {
  await db.handoff.update({ where: { id: handoffId }, data: { pdfFileId: fileId } });
}

export async function setHandoffMarkdown(handoffId: string, markdown: string): Promise<void> {
  await db.handoff.update({ where: { id: handoffId }, data: { markdown } });
}

export async function acknowledgeHandoff(
  tx: Tx,
  handoffId: string,
  userId: string,
  at: Date,
): Promise<void> {
  await tx.handoff.update({
    where: { id: handoffId },
    data: { status: "ACKNOWLEDGED", acknowledgedById: userId, acknowledgedAt: at },
  });
  await tx.handoffAssignment.updateMany({
    where: { handoffId, assignedUserId: userId },
    data: { acknowledgedAt: at },
  });
}

/** Lost deals whose re-engagement date has arrived and whose lead is still LOST. */
export async function listDueReengagements(
  now: Date,
): Promise<{ leadId: string; ownerId: string | null }[]> {
  const deals = await db.deal.findMany({
    where: { outcome: "LOST", reengageAt: { lte: now, not: null }, lead: { status: "LOST" } },
    select: { leadId: true, lead: { select: { ownerId: true } } },
  });
  return deals.map((d) => ({ leadId: d.leadId, ownerId: d.lead.ownerId }));
}

// ---------------------------------------------------------------------------
// Capacity (reads TeamProfile for the suggested delivery owner)
// ---------------------------------------------------------------------------

export interface LineMemberCapacity {
  userId: string;
  name: string;
  weeklyCapacity: number;
  currentLoad: number;
  headroom: number;
}

/** Active members of a line, most headroom first, for the capacity-based handoff suggestion. */
export async function listLineMembersByCapacity(serviceLine: ServiceLine): Promise<LineMemberCapacity[]> {
  const profiles = await db.teamProfile.findMany({
    where: { serviceLines: { has: serviceLine }, user: { status: "ACTIVE" } },
    select: { userId: true, weeklyCapacity: true, currentLoad: true, user: { select: { name: true } } },
  });
  return profiles
    .map((p) => ({
      userId: p.userId,
      name: p.user.name,
      weeklyCapacity: p.weeklyCapacity,
      currentLoad: p.currentLoad,
      headroom: p.weeklyCapacity - p.currentLoad,
    }))
    .sort((a, b) => b.headroom - a.headroom);
}

// ---------------------------------------------------------------------------
// Company + contacts snapshot (handoff content, PDF)
// ---------------------------------------------------------------------------

export interface CompanySnapshot {
  id: string;
  name: string;
  website: string | null;
  country: string | null;
  city: string | null;
}

export interface ContactSnapshot {
  id: string;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
}

export async function getCompanySnapshot(companyId: string): Promise<CompanySnapshot | null> {
  return db.company.findFirst({
    where: { id: companyId },
    select: { id: true, name: true, website: true, country: true, city: true },
  });
}

export async function listCompanyContacts(companyId: string, limit = 10): Promise<ContactSnapshot[]> {
  return db.contact.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, role: true, email: true, phone: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
}

export async function getFindingsForLead(
  leadId: string,
  findingIds: readonly string[],
): Promise<{ id: string; claim: string }[]> {
  if (findingIds.length === 0) return [];
  const findings = await db.auditFinding.findMany({
    where: { id: { in: [...findingIds] }, leadId },
    select: { id: true, claim: true },
  });
  return findings.map((f) => ({ id: f.id, claim: f.claim }));
}

export interface CompanyMeta {
  country: string | null;
  timezone: string | null;
  market: Market;
}

export async function getCompanyMeta(companyId: string): Promise<CompanyMeta | null> {
  return db.company.findFirst({
    where: { id: companyId },
    select: { country: true, timezone: true, market: true },
  });
}

export interface ConversationTurn {
  from: "us" | "them";
  text: string;
}

/** The recent conversation for a lead: sent outbound messages and inbound replies, oldest first. */
export async function listConversation(leadId: string, limit = 20): Promise<ConversationTurn[]> {
  const [messages, replies] = await Promise.all([
    db.message.findMany({
      where: { leadId, status: { in: ["SENT", "SENT_MOCK", "SENT_ASSISTED"] } },
      select: { body: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    }),
    db.reply.findMany({
      where: { leadId },
      select: { latestText: true, receivedAt: true },
      orderBy: { receivedAt: "asc" },
      take: limit,
    }),
  ]);
  const combined = [
    ...messages.map((m) => ({ from: "us" as const, text: m.body, at: m.createdAt })),
    ...replies.map((r) => ({ from: "them" as const, text: r.latestText, at: r.receivedAt })),
  ];
  combined.sort((a, b) => a.at.getTime() - b.at.getTime());
  return combined.slice(-limit).map(({ from, text }) => ({ from, text }));
}

/** Writes a FLAG LeadEvent (no status change), e.g. a rescheduled meeting (§5.2). */
export async function addLeadFlagEvent(
  tx: Tx,
  input: { leadId: string; actorType: "USER" | "SYSTEM"; actorId: string | null; actorLabel: string | null; reason: string; meta?: Record<string, JsonValue> },
): Promise<void> {
  await tx.leadEvent.create({
    data: {
      leadId: input.leadId,
      kind: "FLAG",
      actorType: input.actorType,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      reason: input.reason,
      ...(input.meta === undefined ? {} : { meta: toJsonInput(input.meta) }),
    },
  });
}

/** Marks a lead's last activity, used when something happens that isn't a status change. */
export async function touchLeadActivity(tx: Tx, leadId: string, at: Date): Promise<void> {
  await tx.lead.update({ where: { id: leadId }, data: { lastActivityAt: at } });
}

// ---------------------------------------------------------------------------
// Revenue aggregates (Phase 17 reads these via the pipeline services)
// ---------------------------------------------------------------------------

export interface RevenueFilters {
  serviceLine?: ServiceLine;
  market?: Market;
  from: Date;
  to: Date;
}

function dealWhere(filters: RevenueFilters, outcome: "WON" | "LOST"): Prisma.DealWhereInput {
  return {
    outcome,
    closedAt: { gte: filters.from, lte: filters.to },
    ...(filters.serviceLine === undefined ? {} : { serviceLine: filters.serviceLine }),
    ...(filters.market === undefined ? {} : { market: filters.market }),
  };
}

export async function aggregateWonByCurrency(
  filters: RevenueFilters,
): Promise<{ currency: Currency; count: number; totalMinor: number }[]> {
  const groups = await db.deal.groupBy({
    by: ["currency"],
    where: dealWhere(filters, "WON"),
    _count: { _all: true },
    _sum: { valueMinor: true },
  });
  return groups
    .filter((g): g is typeof g & { currency: Currency } => g.currency !== null)
    .map((g) => ({ currency: g.currency, count: g._count._all, totalMinor: g._sum.valueMinor ?? 0 }));
}

export async function aggregateLossReasons(
  filters: RevenueFilters,
): Promise<{ reason: string; count: number }[]> {
  const groups = await db.deal.groupBy({
    by: ["lostReason"],
    where: dealWhere(filters, "LOST"),
    _count: { _all: true },
  });
  return groups
    .filter((g): g is typeof g & { lostReason: string } => g.lostReason !== null)
    .map((g) => ({ reason: g.lostReason, count: g._count._all }));
}

export async function countProposalsSentAndAccepted(
  filters: RevenueFilters,
): Promise<{ sent: number; accepted: number }> {
  const leadFilter: Prisma.LeadWhereInput = {
    ...(filters.serviceLine === undefined ? {} : { serviceLine: filters.serviceLine }),
    ...(filters.market === undefined ? {} : { market: filters.market }),
  };
  const [sent, accepted] = await Promise.all([
    db.proposal.count({
      where: { sentAt: { gte: filters.from, lte: filters.to, not: null }, lead: leadFilter },
    }),
    db.proposal.count({
      where: { acceptedAt: { gte: filters.from, lte: filters.to, not: null }, lead: leadFilter },
    }),
  ]);
  return { sent, accepted };
}

export async function countMeetingsByStatus(
  filters: RevenueFilters,
): Promise<{ status: string; count: number }[]> {
  const leadFilter: Prisma.LeadWhereInput = {
    ...(filters.serviceLine === undefined ? {} : { serviceLine: filters.serviceLine }),
    ...(filters.market === undefined ? {} : { market: filters.market }),
  };
  const groups = await db.meeting.groupBy({
    by: ["status"],
    where: { startsAt: { gte: filters.from, lte: filters.to }, lead: leadFilter },
    _count: { _all: true },
  });
  return groups.map((g) => ({ status: g.status, count: g._count._all }));
}

/** Won deals in the window with their lead's first-contact time, for time-to-close (Phase 17). */
export async function listWonCloseDurations(filters: RevenueFilters): Promise<number[]> {
  const deals = await db.deal.findMany({
    where: { ...dealWhere(filters, "WON"), lead: { firstContactedAt: { not: null } } },
    select: { closedAt: true, lead: { select: { firstContactedAt: true } } },
  });
  return deals.flatMap((d) => {
    const first = d.lead.firstContactedAt;
    if (first === null) return [];
    const ms = d.closedAt.getTime() - first.getTime();
    return ms >= 0 ? [ms] : [];
  });
}

/** Status-change events in the window, for stage-to-stage conversion (Phase 17). */
export async function listStatusChanges(
  filters: RevenueFilters,
): Promise<{ fromStatus: LeadStatus | null; toStatus: LeadStatus | null }[]> {
  const leadFilter: Prisma.LeadWhereInput = {
    ...(filters.serviceLine === undefined ? {} : { serviceLine: filters.serviceLine }),
    ...(filters.market === undefined ? {} : { market: filters.market }),
  };
  return db.leadEvent.findMany({
    where: { kind: "STATUS_CHANGE", createdAt: { gte: filters.from, lte: filters.to }, lead: leadFilter },
    select: { fromStatus: true, toStatus: true },
  });
}

// ---------------------------------------------------------------------------
// Webhook dedupe (WebhookEvent, unique [provider, eventId])
// ---------------------------------------------------------------------------

export async function findWebhookEvent(
  provider: string,
  eventId: string,
): Promise<{ id: string; status: string } | null> {
  return db.webhookEvent.findFirst({ where: { provider, eventId }, select: { id: true, status: true } });
}

export async function recordWebhookReceived(
  provider: string,
  eventId: string,
  payloadHash: string,
): Promise<string> {
  const row = await db.webhookEvent.create({
    data: { provider, eventId, payloadHash, status: "RECEIVED" },
    select: { id: true },
  });
  return row.id;
}

export async function markWebhookProcessed(id: string, at: Date): Promise<void> {
  await db.webhookEvent.update({ where: { id }, data: { status: "PROCESSED", processedAt: at } });
}

export async function markWebhookFailed(id: string, error: string): Promise<void> {
  await db.webhookEvent.update({ where: { id }, data: { status: "FAILED", error: error.slice(0, 500) } });
}

export { isUniqueViolation } from "@/platform/db";

// ---------------------------------------------------------------------------
// Seam stand-in support (deleted at integration)
// ---------------------------------------------------------------------------

/** SEAM-STOP-SEQUENCE stand-in helper: stop ACTIVE/PAUSED enrolments in scope. */
export async function stopEnrollmentsDirect(
  client: Tx,
  scope: { leadId?: string; contactId?: string; companyId?: string },
  reason: EnrollmentStopReason,
  at: Date,
): Promise<number> {
  const where: Prisma.EnrollmentWhereInput = {
    status: { in: ["ACTIVE", "PAUSED"] },
    ...(scope.leadId === undefined ? {} : { leadId: scope.leadId }),
    ...(scope.contactId === undefined ? {} : { contactId: scope.contactId }),
    ...(scope.companyId === undefined ? {} : { companyId: scope.companyId }),
  };
  const result = await client.enrollment.updateMany({
    where,
    data: { status: "STOPPED", stoppedReason: reason, stoppedAt: at },
  });
  return result.count;
}

/** SEAM-SEND-ONEOFF stand-in helper: write a SENT_MOCK one-off email Message. */
export async function createMockOneOff(
  client: Tx,
  input: { leadId: string; companyId: string; contactId: string; subject: string; body: string; sentById: string | null; at: Date },
): Promise<string> {
  const row = await client.message.create({
    data: {
      leadId: input.leadId,
      companyId: input.companyId,
      contactId: input.contactId,
      kind: "ONE_OFF",
      channel: "EMAIL",
      status: "SENT_MOCK",
      subject: input.subject,
      body: input.body,
      humanConfirmedClaims: true,
      sentById: input.sentById,
      sentAt: input.at,
    },
    select: { id: true },
  });
  return row.id;
}
