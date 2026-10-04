import "server-only";

/**
 * Read model for the lead-detail header, side rail and activity. Composes the lead, its company,
 * owner, contacts and current enrolment — none of which has a single UI read service today (core
 * owns only the state machine). See CR-16-GAP-LEADS-LIST. Evidence, conversation, meetings,
 * proposals and notes come from their own services; only the header/side-rail/activity are read
 * here. The page authorises `acquisition.lead.read` for the line before calling.
 */

import { ContactabilitySchema, type Contactability } from "@/contracts/enrichment";
import type {
  ContactSeniority,
  EmailStatus,
  EmailType,
  EnrollmentStatus,
  EnrollmentPauseReason,
  EnrollmentStopReason,
  LeadEventKind,
  LeadStatus,
  LegalForm,
  CompanySizeRange,
  Market,
  MessageStatus,
  NurtureReason,
  ScoreBand,
  ServiceLine,
  WebsiteKind,
  WhatsAppStatus,
} from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

import { safeHttpUrl } from "./safe-url";

export interface LeadContactView {
  id: string;
  name: string | null;
  role: string | null;
  seniority: ContactSeniority;
  email: string | null;
  emailStatus: EmailStatus;
  emailType: EmailType | null;
  phone: string | null;
  whatsappStatus: WhatsAppStatus;
  linkedinUrl: string | null;
  isPrimary: boolean;
}

export interface LeadEnrolmentView {
  status: EnrollmentStatus;
  pausedUntil: Date | null;
  pauseReason: EnrollmentPauseReason | null;
  stoppedReason: EnrollmentStopReason | null;
}

export interface LeadHeaderView {
  id: string;
  serviceLine: ServiceLine;
  status: LeadStatus;
  market: Market;
  country: string | null;
  score: number | null;
  scoreBand: ScoreBand | null;
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  talkingPoints: string[];
  needsHumanReview: boolean;
  complianceReview: boolean;
  nurtureReason: NurtureReason | null;
  disqualifyReason: string | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  snoozedUntil: Date | null;
  firstContactedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  contactability: Contactability | null;
  contactabilityEvaluatedAt: Date | null;
  owner: { id: string; name: string | null; image: string | null } | null;
  primaryContactId: string | null;
  company: {
    id: string;
    name: string;
    website: string | null;
    websiteKind: WebsiteKind;
    normalizedDomain: string | null;
    city: string | null;
    country: string | null;
    legalForm: LegalForm;
    sizeRange: CompanySizeRange;
    industry: string | null;
    firstSource: string;
    firstSourceUrl: string | null;
    socials: unknown;
  };
  contacts: LeadContactView[];
  enrolment: LeadEnrolmentView | null;
}

export async function getLeadHeader(leadId: string): Promise<LeadHeaderView | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      serviceLine: true,
      status: true,
      market: true,
      country: true,
      score: true,
      scoreBand: true,
      brief: true,
      keyFindingIds: true,
      suggestedAngleId: true,
      talkingPoints: true,
      needsHumanReview: true,
      complianceReview: true,
      nurtureReason: true,
      disqualifyReason: true,
      nextActionAt: true,
      nextActionNote: true,
      snoozedUntil: true,
      firstContactedAt: true,
      lastActivityAt: true,
      createdAt: true,
      contactability: true,
      contactabilityEvaluatedAt: true,
      primaryContactId: true,
      owner: { select: { id: true, name: true, image: true } },
      company: {
        select: {
          id: true,
          name: true,
          website: true,
          websiteKind: true,
          normalizedDomain: true,
          city: true,
          country: true,
          legalForm: true,
          sizeRange: true,
          industry: true,
          firstSource: true,
          firstSourceUrl: true,
          socials: true,
          contacts: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              role: true,
              seniority: true,
              email: true,
              emailStatus: true,
              emailType: true,
              phone: true,
              whatsappStatus: true,
              linkedinUrl: true,
            },
          },
        },
      },
    },
  });
  if (lead === null) return null;

  const enrolmentRow = await db.enrollment.findFirst({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    select: { status: true, pausedUntil: true, pauseReason: true, stoppedReason: true },
  });
  const contactability = ContactabilitySchema.safeParse(lead.contactability);

  return {
    id: lead.id,
    serviceLine: lead.serviceLine,
    status: lead.status,
    market: lead.market,
    country: lead.country,
    score: lead.score,
    scoreBand: lead.scoreBand,
    brief: lead.brief,
    keyFindingIds: lead.keyFindingIds,
    suggestedAngleId: lead.suggestedAngleId,
    talkingPoints: lead.talkingPoints,
    needsHumanReview: lead.needsHumanReview,
    complianceReview: lead.complianceReview,
    nurtureReason: lead.nurtureReason,
    disqualifyReason: lead.disqualifyReason,
    nextActionAt: lead.nextActionAt,
    nextActionNote: lead.nextActionNote,
    snoozedUntil: lead.snoozedUntil,
    firstContactedAt: lead.firstContactedAt,
    lastActivityAt: lead.lastActivityAt,
    createdAt: lead.createdAt,
    // Stored as JSON, so it is parsed rather than cast: a verdict written by an older version of
    // the contract reads as "not evaluated" instead of crashing the side rail.
    contactability: contactability.success ? contactability.data : null,
    contactabilityEvaluatedAt: lead.contactabilityEvaluatedAt,
    owner: lead.owner,
    primaryContactId: lead.primaryContactId,
    company: {
      id: lead.company.id,
      name: lead.company.name,
      // Websites, source links and profile links are scraped or imported text. Only http(s) URLs
      // reach an `href` (`safeHttpUrl`); anything else is dropped.
      website: safeHttpUrl(lead.company.website),
      websiteKind: lead.company.websiteKind,
      normalizedDomain: lead.company.normalizedDomain,
      city: lead.company.city,
      country: lead.company.country,
      legalForm: lead.company.legalForm,
      sizeRange: lead.company.sizeRange,
      industry: lead.company.industry,
      firstSource: lead.company.firstSource,
      firstSourceUrl: safeHttpUrl(lead.company.firstSourceUrl),
      socials: lead.company.socials,
    },
    contacts: lead.company.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      seniority: c.seniority,
      email: c.email,
      emailStatus: c.emailStatus,
      emailType: c.emailType,
      phone: c.phone,
      whatsappStatus: c.whatsappStatus,
      linkedinUrl: safeHttpUrl(c.linkedinUrl),
      isPrimary: c.id === lead.primaryContactId,
    })),
    enrolment: enrolmentRow,
  };
}

export interface LeadActivityItem {
  id: string;
  kind: LeadEventKind;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  actorLabel: string | null;
  reason: string | null;
  createdAt: Date;
}

/** The most recent events on a lead, newest first. `kind` narrows them in the query. */
export async function getLeadActivity(
  leadId: string,
  kind: LeadEventKind | null = null,
  limit = 100,
): Promise<LeadActivityItem[]> {
  const events = await db.leadEvent.findMany({
    // Filtered here, not after the read: filtering 100 loaded rows would hide older events of the
    // chosen kind behind newer events of other kinds.
    where: { leadId, ...(kind === null ? {} : { kind }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
    select: {
      id: true,
      kind: true,
      fromStatus: true,
      toStatus: true,
      actorLabel: true,
      actorType: true,
      reason: true,
      createdAt: true,
    },
  });
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    actorLabel: e.actorLabel ?? (e.actorType === "SYSTEM" ? "System" : null),
    reason: e.reason,
    createdAt: e.createdAt,
  }));
}

/** Signals attached to a lead, for the Overview timeline. */
export interface LeadSignalView {
  id: string;
  signalType: string;
  evidenceText: string;
  sourceUrl: string | null;
  observedAt: Date;
  adapterId: string;
}

/** The other open leads in this lead's active cross-sell group (one per other service line). */
export async function getCrossSellSiblings(
  leadId: string,
): Promise<{ id: string; serviceLine: ServiceLine }[]> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { crossSellGroupId: true },
  });
  const groupId = lead?.crossSellGroupId ?? null;
  if (groupId === null) return [];
  return db.lead.findMany({
    where: {
      crossSellGroupId: groupId,
      id: { not: leadId },
      crossSellGroup: { status: "ACTIVE" },
    },
    select: { id: true, serviceLine: true },
    orderBy: { serviceLine: "asc" },
  });
}

/** What an action needs to know about a lead before it authorises and acts on it. */
export interface LeadScope {
  serviceLine: ServiceLine;
  ownerId: string | null;
  status: LeadStatus;
  companyId: string;
  /** True once the lead has been contacted. A re-score then refreshes the score only. */
  contacted: boolean;
}

const SCOPE_SELECT = {
  id: true,
  serviceLine: true,
  ownerId: true,
  status: true,
  companyId: true,
  firstContactedAt: true,
} as const;

function toScope(lead: {
  serviceLine: ServiceLine;
  ownerId: string | null;
  status: LeadStatus;
  companyId: string;
  firstContactedAt: Date | null;
}): LeadScope {
  return {
    serviceLine: lead.serviceLine,
    ownerId: lead.ownerId,
    status: lead.status,
    companyId: lead.companyId,
    contacted: lead.firstContactedAt !== null,
  };
}

export async function getLeadScope(leadId: string): Promise<LeadScope | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: SCOPE_SELECT });
  return lead === null ? null : toScope(lead);
}

/** The scope of each lead in `leadIds`, in one read, for authorising a bulk action. */
export async function getLeadScopes(leadIds: string[]): Promise<Map<string, LeadScope>> {
  const leads = await db.lead.findMany({ where: { id: { in: leadIds } }, select: SCOPE_SELECT });
  return new Map(leads.map((lead) => [lead.id, toScope(lead)]));
}

/** A lead's scope as the resource the permission matrix evaluates. */
export function leadResource(scope: { serviceLine: ServiceLine; ownerId: string | null }): {
  serviceLine: ServiceLine;
  ownerId?: string;
} {
  return {
    serviceLine: scope.serviceLine,
    ...(scope.ownerId === null ? {} : { ownerId: scope.ownerId }),
  };
}

/** True when `contactId` is a live contact of the lead's own company. */
export async function isLeadContact(leadId: string, contactId: string): Promise<boolean> {
  const matches = await db.contact.count({
    where: { id: contactId, deletedAt: null, company: { leads: { some: { id: leadId } } } },
  });
  return matches > 0;
}

/** The lead a proposal belongs to, or null when the proposal doesn't exist. */
export async function getProposalLeadId(proposalId: string): Promise<string | null> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    select: { leadId: true },
  });
  return proposal?.leadId ?? null;
}

/** Where a message stands after a send was requested: its status and any scheduled time. */
export async function getMessageDelivery(
  messageId: string,
): Promise<{ status: MessageStatus; scheduledFor: Date | null } | null> {
  return db.message.findUnique({
    where: { id: messageId },
    select: { status: true, scheduledFor: true },
  });
}

/**
 * True when `userId` is an active member of the line's team. The same rule `assignLead` applies to
 * a new lead owner: the line is in the person's team profile.
 */
export async function isOnLineTeam(userId: string, line: ServiceLine): Promise<boolean> {
  const matches = await db.teamProfile.count({
    where: { userId, serviceLines: { has: line }, user: { status: "ACTIVE" } },
  });
  return matches > 0;
}

/** The service lines sold on the deal behind a handoff, or null when the handoff doesn't exist. */
export async function getHandoffServices(handoffId: string): Promise<ServiceLine[] | null> {
  const handoff = await db.handoff.findUnique({
    where: { id: handoffId },
    select: { deal: { select: { services: true } } },
  });
  return handoff?.deal.services ?? null;
}

/**
 * Set a lead's primary contact (INV: not a status change). No core service exposes this yet, so it
 * is a guarded repo write; the calling action authorises `acquisition.lead.update` first. See
 * CR-16-GAP-SET-PRIMARY. The contact must be a live contact of the lead's own company; anything else
 * is refused rather than ignored, so the caller never reports a change that didn't happen.
 */
export async function setPrimaryContact(leadId: string, contactId: string): Promise<void> {
  const [lead, contact] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { companyId: true } }),
    db.contact.findUnique({
      where: { id: contactId },
      select: { companyId: true, deletedAt: true },
    }),
  ]);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  if (contact?.deletedAt !== null || contact.companyId !== lead.companyId) {
    throw new AppError("VALIDATION_FAILED", "That contact doesn't belong to this lead's company.");
  }
  await db.lead.update({ where: { id: leadId }, data: { primaryContactId: contactId } });
}

export async function getLeadSignals(leadId: string): Promise<LeadSignalView[]> {
  const signals = await db.signal.findMany({
    where: { leadId },
    orderBy: { observedAt: "desc" },
    take: 50,
    select: {
      id: true,
      signalType: true,
      evidenceText: true,
      sourceUrl: true,
      observedAt: true,
      adapterId: true,
    },
  });
  return signals;
}
