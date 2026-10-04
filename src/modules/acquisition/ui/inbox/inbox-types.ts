import type { LeadStatus, Market, ReplyClass, ScoreBand, SlaStatus } from "@/contracts/common";

/**
 * Client-safe types and rules for the inbox screen: the filter model kept in the URL, the views the
 * server hands over, and what reclassifying a reply to or from UNSUBSCRIBE means for the user.
 */

export const REPLY_CLASSES: readonly ReplyClass[] = [
  "INTERESTED",
  "QUESTION",
  "OBJECTION_PRICE",
  "OBJECTION_OTHER",
  "NOT_NOW",
  "WRONG_PERSON",
  "UNSUBSCRIBE",
  "OUT_OF_OFFICE",
  "BOUNCE",
  "OTHER",
];

/** The classes the inbox service prepares a suggested response for. */
export const DRAFTABLE_CLASSES: readonly ReplyClass[] = [
  "INTERESTED",
  "QUESTION",
  "OBJECTION_PRICE",
  "OBJECTION_OTHER",
  "NOT_NOW",
  "WRONG_PERSON",
];

export const SLA_STATUSES: readonly SlaStatus[] = [
  "ON_TRACK",
  "WARNING",
  "BREACHED",
  "MET",
  "NONE",
];

export const SLA_LABEL: Record<SlaStatus, string> = {
  ON_TRACK: "On track",
  WARNING: "Due soon",
  BREACHED: "Overdue",
  MET: "Answered",
  NONE: "No timer",
};

/** WhatsApp prepared text may not exceed this (project-rules §"Output/document rules"). */
export const WHATSAPP_LIMIT = 600;

export type InboxTab = "threads" | "unmatched";

export interface InboxFilters {
  tab: InboxTab;
  classification?: ReplyClass | undefined;
  slaStatus?: SlaStatus | undefined;
  market?: Market | undefined;
  ownerId?: string | undefined;
  unread: boolean;
  needsReview: boolean;
  limit: number;
  thread?: string | undefined;
}

export interface ThreadRowView {
  leadId: string;
  companyName: string;
  market: Market | null;
  ownerId: string | null;
  ownerName: string | null;
  classification: ReplyClass | null;
  slaStatus: SlaStatus;
  slaDueAt: string | null;
  summary: string | null;
  unread: number;
  needsHumanReview: boolean;
  latestAt: string;
}

export interface UnmatchedReplyView {
  id: string;
  fromAddress: string | null;
  subject: string | null;
  summary: string | null;
  receivedAt: string;
}

export interface InboxCapabilities {
  reply: boolean;
  reclassify: boolean;
  assign: boolean;
  logAssisted: boolean;
  link: boolean;
  bookMeeting: boolean;
}

/** The lead behind the open thread, for the context rail. */
export interface ThreadContextView {
  leadId: string;
  leadHref: string;
  companyName: string;
  place: string | null;
  status: LeadStatus;
  market: Market;
  score: number | null;
  scoreBand: ScoreBand | null;
  brief: string | null;
  ownerId: string | null;
  ownerName: string | null;
  primaryContact: { name: string | null; role: string | null; email: string | null } | null;
  channels: { name: string; status: string; reason: string }[];
}

/** The suggested response loaded into the composer. */
export interface ComposerDraft {
  /** The draft message's id: how the composer tells a new suggestion from the one it has. */
  id: string;
  subject: string | null;
  body: string;
  needsPricingApproval: boolean;
  citations: { id: string; claim: string }[];
}

/** The response-timer states that mean a thread is still waiting for an answer. */
const WAITING: readonly SlaStatus[] = ["ON_TRACK", "WARNING", "BREACHED"];

/** Thread rows with the most recent reply first. The inbox service doesn't return them in date order. */
export function newestFirst(rows: readonly ThreadRowView[]): ThreadRowView[] {
  return [...rows].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

export interface InboxSummary {
  shown: number;
  unread: number;
  waiting: number;
}

/**
 * The header figures, counted from the rows on screen: how many threads have unread replies and how
 * many are waiting for a response. They describe exactly the list beneath them, under its filters.
 */
export function summariseRows(rows: readonly ThreadRowView[]): InboxSummary {
  return {
    shown: rows.length,
    unread: rows.filter((row) => row.unread > 0).length,
    waiting: rows.filter((row) => WAITING.includes(row.slaStatus)).length,
  };
}

export interface ReplyBlock {
  reason: "unsubscribed" | "bounced" | "suppressed";
  /** Why no reply can be sent, in plain words. */
  message: string;
}

/**
 * Whether a reply may be answered at all. An unsubscribe is never answered (INV-23), a bounce has
 * nobody to answer, and a suppressed lead can't be messaged. The page hides the composer for these
 * and the send action refuses them, whatever the screen showed.
 */
export function replyBlock(
  classification: ReplyClass | null,
  leadStatus: LeadStatus,
): ReplyBlock | null {
  if (classification === "UNSUBSCRIBE") {
    return {
      reason: "unsubscribed",
      message:
        "This contact asked to stop hearing from us. They have been suppressed, and no reply can be sent.",
    };
  }
  if (leadStatus === "SUPPRESSED") {
    return {
      reason: "suppressed",
      message:
        "This lead is suppressed, so it can't be messaged. An admin can remove the suppression.",
    };
  }
  if (classification === "BOUNCE") {
    return {
      reason: "bounced",
      message:
        "This is a delivery failure, not a reply from a person. There is nobody to answer here.",
    };
  }
  return null;
}

export interface ReclassifyNotice {
  title: string;
  /** What will happen, in plain words. */
  consequence: string;
  tone: "default" | "danger";
  confirmLabel: string;
}

/**
 * What the user must be told before a reply's class changes (module spec US-29). Moving to
 * UNSUBSCRIBE suppresses the contact and stops outreach, so it is spelled out and confirmed. Moving
 * away from UNSUBSCRIBE does not lift the suppression: only an admin can remove one.
 */
export function reclassifyNotice(
  from: ReplyClass | null,
  to: ReplyClass,
  label: (value: ReplyClass) => string,
): ReclassifyNotice {
  if (to === "UNSUBSCRIBE") {
    return {
      title: "Reclassify as unsubscribe?",
      consequence:
        "This will suppress this contact and stop all outreach to the company. No reply will be sent.",
      tone: "danger",
      confirmLabel: "Suppress and reclassify",
    };
  }
  if (from === "UNSUBSCRIBE") {
    return {
      title: `Reclassify as ${label(to).toLowerCase()}?`,
      consequence:
        "The suppression stays in place. This contact still can't be messaged until an admin removes the suppression.",
      tone: "default",
      confirmLabel: "Reclassify",
    };
  }
  return {
    title: `Reclassify as ${label(to).toLowerCase()}?`,
    consequence:
      "The reply is actioned again under its new class. That can change the lead's status and its outreach.",
    tone: "default",
    confirmLabel: "Reclassify",
  };
}
