/**
 * The 76 development leads (data-model §10.5): every status in every line, both markets, each
 * with the status trail that led there. Companies are referenced by seed number (companies.ts).
 *
 * 64 companies hold 76 leads, so 12 companies have two: the cross-sell company (Adunni Bakes,
 * two open qualified leads) and 11 others where one of the two leads is early (NEW to AUDITED) or
 * closed, so no other cross-sell group forms.
 */

import type { LeadStatus, NurtureReason, ServiceLine } from "@/contracts/common";

import type { UserKey } from "./users";

// ---- Status trails (every step is allowed by LEAD_TRANSITIONS; world.test.ts checks) ----
const NEW = ["NEW"] as const;
const ENRICHING = [...NEW, "ENRICHING"] as const;
const ENRICHED = [...ENRICHING, "ENRICHED"] as const;
const AUDITING = [...ENRICHED, "AUDITING"] as const;
const AUDITED = [...AUDITING, "AUDITED"] as const;
const SCORED = [...AUDITED, "SCORED"] as const;
const IN_REVIEW = [...SCORED, "IN_REVIEW"] as const;
const APPROVED = [...IN_REVIEW, "APPROVED"] as const;
const CONTACTED = [...APPROVED, "CONTACTED"] as const;
const REPLIED = [...CONTACTED, "REPLIED"] as const;
const MEETING_BOOKED = [...REPLIED, "MEETING_BOOKED"] as const;
/** Booked straight from the booking link, without a reply first. */
const MEETING_FROM_LINK = [...CONTACTED, "MEETING_BOOKED"] as const;
const PROPOSAL_SENT = [...MEETING_BOOKED, "PROPOSAL_SENT"] as const;

export const TRAILS = {
  NEW,
  ENRICHING,
  ENRICHED,
  AUDITING,
  AUDITED,
  SCORED,
  IN_REVIEW,
  APPROVED,
  CONTACTED,
  REPLIED,
  MEETING_BOOKED,
  MEETING_FROM_LINK,
  PROPOSAL_SENT,
  /** A meeting was booked, then cancelled: back to REPLIED. */
  REPLIED_AFTER_CANCEL: [...MEETING_BOOKED, "REPLIED"],
  WON: [...PROPOSAL_SENT, "WON"],
  WON_FROM_MEETING: [...MEETING_FROM_LINK, "WON"],
  LOST_AFTER_PROPOSAL: [...PROPOSAL_SENT, "LOST"],
  LOST_AFTER_MEETING: [...MEETING_BOOKED, "LOST"],
  LOST_NO_RESPONSE: [...CONTACTED, "LOST"],
  NURTURE_AFTER_REPLY: [...REPLIED, "NURTURE"],
  NURTURE_AFTER_SCORE: [...SCORED, "NURTURE"],
  /** Scored below the band with lowScoreAction NURTURE: parked at scoring, never SCORED. */
  NURTURE_AT_SCORING: [...AUDITED, "NURTURE"],
  NURTURE_REENGAGED: [...CONTACTED, "LOST", "NURTURE"],
  DISQUALIFIED_AT_ENRICHMENT: [...ENRICHED, "DISQUALIFIED"],
  DISQUALIFIED_AT_AUDIT: [...AUDITED, "DISQUALIFIED"],
  DISQUALIFIED_AT_SCORE: [...SCORED, "DISQUALIFIED"],
  SUPPRESSED_AFTER_CONTACT: [...CONTACTED, "SUPPRESSED"],
  SUPPRESSED_AFTER_SCORE: [...SCORED, "SUPPRESSED"],
} as const satisfies Record<string, readonly LeadStatus[]>;

export interface LeadSpec {
  n: number;
  line: ServiceLine;
  /** Company seed number (1–64). The market follows the company's country. */
  company: number;
  trail: readonly LeadStatus[];
  owner: UserKey;
  /** Days since the lead was created. */
  age: number;
  /** Days since the last status change (default: 15% of the age). */
  last?: number;
  score?: number;
  nurtureReason?: NurtureReason;
  /** "low_score", "no_channel" or "disqualifier:<id>" (§5.2). */
  disqualifyReason?: string;
  needsHumanReview?: boolean;
  heldByCrossSell?: boolean;
  /** Days from now (negative = overdue). */
  nextActionIn?: number;
  nextActionNote?: string;
  stale?: boolean;
  /** Index of the company contact the lead works with, when it isn't the first reachable one. */
  contact?: number;
}

const W = "WEB_DEVELOPMENT";
const U = "UI_UX_DESIGN";
const G = "GRAPHIC_DESIGN";
const V = "VIDEO_EDITING";
const T = TRAILS;

export const LEAD_SPECS: readonly LeadSpec[] = [
  // ---- Web Development (20) ----
  { n: 1, line: W, company: 25, trail: T.NEW, owner: "webLead", age: 0.2 },
  { n: 2, line: W, company: 52, trail: T.ENRICHING, owner: "kelechi", age: 1 },
  { n: 3, line: W, company: 26, trail: T.ENRICHED, owner: "webLead", age: 2 },
  { n: 4, line: W, company: 36, trail: T.AUDITING, owner: "kelechi", age: 3, last: 0.1 },
  { n: 5, line: W, company: 2, trail: T.AUDITED, owner: "webLead", age: 4 },
  { n: 6, line: W, company: 12, trail: T.SCORED, owner: "kelechi", age: 5, score: 71 },
  {
    n: 7,
    line: W,
    company: 37,
    trail: T.SCORED,
    owner: "webLead",
    age: 6,
    score: 52,
    needsHumanReview: true,
  },
  { n: 8, line: W, company: 1, trail: T.IN_REVIEW, owner: "webLead", age: 7, score: 78 },
  { n: 9, line: W, company: 35, trail: T.IN_REVIEW, owner: "kelechi", age: 6, score: 69 },
  {
    n: 10,
    line: W,
    company: 19,
    trail: T.APPROVED,
    owner: "webLead",
    age: 9,
    last: 0.5,
    score: 74,
  },
  {
    n: 11,
    line: W,
    company: 16,
    trail: T.CONTACTED,
    owner: "kelechi",
    age: 14,
    last: 6,
    score: 76,
    nextActionIn: -1,
    nextActionNote: "Send the step 2 email",
  },
  {
    n: 12,
    line: W,
    company: 57,
    trail: T.CONTACTED,
    owner: "webLead",
    age: 16,
    last: 8,
    score: 67,
  },
  {
    n: 13,
    line: W,
    company: 51,
    trail: T.REPLIED_AFTER_CANCEL,
    owner: "webLead",
    age: 20,
    last: 0.04,
    score: 81,
  },
  {
    n: 14,
    line: W,
    company: 5,
    trail: T.MEETING_BOOKED,
    owner: "webLead",
    age: 21,
    last: 2,
    score: 83,
  },
  {
    n: 15,
    line: W,
    company: 38,
    trail: T.PROPOSAL_SENT,
    owner: "kelechi",
    age: 30,
    last: 4,
    score: 79,
    nextActionIn: 2,
    nextActionNote: "Follow up on the revised proposal",
  },
  { n: 16, line: W, company: 4, trail: T.WON, owner: "webLead", age: 50, last: 12, score: 85 },
  {
    n: 17,
    line: W,
    company: 53,
    trail: T.LOST_AFTER_PROPOSAL,
    owner: "kelechi",
    age: 45,
    last: 15,
    score: 72,
  },
  {
    n: 18,
    line: W,
    company: 15,
    trail: T.NURTURE_AFTER_REPLY,
    owner: "webLead",
    age: 35,
    last: 9,
    score: 70,
    nurtureReason: "NOT_NOW",
    nextActionIn: 60,
    nextActionNote: "They asked us to check back after the new branch opens",
  },
  {
    n: 19,
    line: W,
    company: 42,
    trail: T.DISQUALIFIED_AT_ENRICHMENT,
    owner: "webLead",
    age: 12,
    last: 11,
    disqualifyReason: "disqualifier:competitor_agency",
  },
  {
    n: 20,
    line: W,
    company: 28,
    trail: T.SUPPRESSED_AFTER_CONTACT,
    owner: "kelechi",
    age: 25,
    last: 10,
    score: 68,
  },
  // ---- UI/UX Design (18) ----
  { n: 21, line: U, company: 58, trail: T.NEW, owner: "uiuxLead", age: 0.5 },
  { n: 22, line: U, company: 10, trail: T.ENRICHING, owner: "zainab", age: 1 },
  { n: 23, line: U, company: 44, trail: T.ENRICHED, owner: "uiuxLead", age: 2 },
  { n: 24, line: U, company: 13, trail: T.AUDITING, owner: "zainab", age: 3, last: 0.2 },
  { n: 25, line: U, company: 48, trail: T.AUDITED, owner: "uiuxLead", age: 4 },
  { n: 26, line: U, company: 54, trail: T.SCORED, owner: "zainab", age: 6, score: 66 },
  { n: 27, line: U, company: 3, trail: T.IN_REVIEW, owner: "uiuxLead", age: 8, score: 73 },
  {
    n: 28,
    line: U,
    company: 46,
    trail: T.IN_REVIEW,
    owner: "zainab",
    age: 7,
    score: 64,
  },
  {
    n: 29,
    line: U,
    company: 40,
    trail: T.APPROVED,
    owner: "uiuxLead",
    age: 10,
    last: 0.3,
    score: 77,
  },
  { n: 30, line: U, company: 50, trail: T.CONTACTED, owner: "zainab", age: 15, last: 7, score: 82 },
  {
    n: 31,
    line: U,
    company: 17,
    trail: T.REPLIED,
    owner: "uiuxLead",
    age: 18,
    last: 0.15,
    score: 70,
  },
  {
    n: 32,
    line: U,
    company: 49,
    trail: T.MEETING_FROM_LINK,
    owner: "zainab",
    age: 22,
    last: 3,
    score: 80,
  },
  {
    n: 33,
    line: U,
    company: 6,
    trail: T.PROPOSAL_SENT,
    owner: "uiuxLead",
    age: 32,
    last: 6,
    score: 75,
    nextActionIn: 1,
    nextActionNote: "Call about the proposal",
  },
  { n: 34, line: U, company: 55, trail: T.WON, owner: "uiuxLead", age: 55, last: 20, score: 84 },
  {
    n: 35,
    line: U,
    company: 8,
    trail: T.LOST_AFTER_MEETING,
    owner: "zainab",
    age: 40,
    last: 18,
    score: 71,
  },
  {
    n: 36,
    line: U,
    company: 60,
    trail: T.NURTURE_AT_SCORING,
    owner: "uiuxLead",
    age: 11,
    last: 10,
    score: 34,
    nurtureReason: "LOW_SCORE",
    nextActionIn: 80,
  },
  {
    n: 37,
    line: U,
    company: 22,
    trail: T.DISQUALIFIED_AT_SCORE,
    owner: "zainab",
    age: 13,
    last: 12,
    score: 22,
    disqualifyReason: "low_score",
  },
  {
    n: 38,
    line: U,
    company: 41,
    trail: T.SUPPRESSED_AFTER_CONTACT,
    owner: "uiuxLead",
    age: 24,
    last: 11,
    score: 69,
  },
  // ---- Graphic Design (19) ----
  { n: 39, line: G, company: 32, trail: T.NEW, owner: "graphicLead", age: 0.3 },
  { n: 40, line: G, company: 47, trail: T.ENRICHING, owner: "kelechi", age: 1 },
  { n: 41, line: G, company: 7, trail: T.ENRICHED, owner: "graphicLead", age: 2 },
  { n: 42, line: G, company: 64, trail: T.AUDITING, owner: "kelechi", age: 3, last: 0.15 },
  { n: 43, line: G, company: 18, trail: T.AUDITED, owner: "graphicLead", age: 4 },
  {
    n: 44,
    line: G,
    company: 1,
    trail: T.SCORED,
    owner: "graphicLead",
    age: 7,
    score: 64,
    heldByCrossSell: true,
  },
  { n: 45, line: G, company: 29, trail: T.IN_REVIEW, owner: "kelechi", age: 9, score: 72 },
  { n: 46, line: G, company: 52, trail: T.IN_REVIEW, owner: "graphicLead", age: 8, score: 68 },
  {
    n: 47,
    line: G,
    company: 33,
    trail: T.APPROVED,
    owner: "kelechi",
    age: 10,
    last: 0.6,
    score: 73,
  },
  {
    n: 48,
    line: G,
    company: 23,
    trail: T.CONTACTED,
    owner: "graphicLead",
    age: 13,
    last: 9,
    score: 71,
    stale: true,
  },
  { n: 49, line: G, company: 36, trail: T.REPLIED, owner: "kelechi", age: 19, last: 2, score: 70 },
  {
    n: 50,
    line: G,
    company: 11,
    trail: T.MEETING_BOOKED,
    owner: "graphicLead",
    age: 23,
    last: 1,
    score: 76,
  },
  {
    n: 51,
    line: G,
    company: 43,
    trail: T.PROPOSAL_SENT,
    owner: "graphicLead",
    age: 31,
    last: 5,
    score: 78,
  },
  { n: 52, line: G, company: 35, trail: T.WON, owner: "graphicLead", age: 48, last: 16, score: 80 },
  {
    n: 53,
    line: G,
    company: 31,
    trail: T.LOST_NO_RESPONSE,
    owner: "kelechi",
    age: 38,
    last: 8,
    score: 67,
  },
  {
    n: 54,
    line: G,
    company: 62,
    trail: T.NURTURE_AFTER_SCORE,
    owner: "graphicLead",
    age: 5,
    last: 3,
    score: 74,
    nurtureReason: "CAPACITY",
  },
  {
    n: 55,
    line: G,
    company: 24,
    trail: T.NURTURE_AFTER_SCORE,
    owner: "kelechi",
    age: 6,
    last: 4,
    score: 69,
    nurtureReason: "COMPLIANCE",
  },
  {
    n: 56,
    line: G,
    company: 21,
    trail: T.DISQUALIFIED_AT_ENRICHMENT,
    owner: "graphicLead",
    age: 9,
    last: 8,
    disqualifyReason: "no_channel",
  },
  {
    n: 57,
    line: G,
    company: 34,
    trail: T.SUPPRESSED_AFTER_SCORE,
    owner: "kelechi",
    age: 17,
    last: 6,
    score: 63,
  },
  // ---- Video Editing (19) ----
  { n: 58, line: V, company: 63, trail: T.NEW, owner: "videoLead", age: 0.4 },
  { n: 59, line: V, company: 20, trail: T.ENRICHING, owner: "zainab", age: 1 },
  { n: 60, line: V, company: 55, trail: T.ENRICHED, owner: "videoLead", age: 2 },
  { n: 61, line: V, company: 30, trail: T.AUDITING, owner: "zainab", age: 3, last: 0.25 },
  { n: 62, line: V, company: 39, trail: T.AUDITED, owner: "videoLead", age: 4 },
  { n: 63, line: V, company: 58, trail: T.SCORED, owner: "zainab", age: 6, score: 62 },
  { n: 64, line: V, company: 9, trail: T.IN_REVIEW, owner: "videoLead", age: 8, score: 77 },
  { n: 65, line: V, company: 59, trail: T.IN_REVIEW, owner: "zainab", age: 7, score: 66 },
  {
    n: 66,
    line: V,
    company: 61,
    trail: T.APPROVED,
    owner: "videoLead",
    age: 10,
    last: 0.4,
    score: 71,
  },
  {
    n: 67,
    line: V,
    company: 14,
    trail: T.CONTACTED,
    owner: "videoLead",
    age: 12,
    last: 8,
    score: 79,
    stale: true,
    nextActionIn: -2,
    nextActionNote: "Confirm the WhatsApp message was read",
  },
  {
    n: 68,
    line: V,
    company: 56,
    trail: T.CONTACTED,
    owner: "zainab",
    age: 14,
    last: 6,
    score: 65,
    needsHumanReview: true,
  },
  {
    n: 69,
    line: V,
    company: 26,
    trail: T.REPLIED,
    owner: "videoLead",
    age: 17,
    last: 1,
    score: 68,
  },
  {
    n: 70,
    line: V,
    company: 45,
    trail: T.MEETING_BOOKED,
    owner: "zainab",
    age: 26,
    last: 5,
    score: 73,
  },
  {
    n: 71,
    line: V,
    company: 22,
    trail: T.PROPOSAL_SENT,
    owner: "videoLead",
    age: 36,
    last: 20,
    score: 74,
    nextActionIn: -3,
    nextActionNote: "The proposal expired: send the revised draft",
  },
  {
    n: 72,
    line: V,
    company: 27,
    trail: T.WON_FROM_MEETING,
    owner: "videoLead",
    age: 42,
    last: 14,
    score: 82,
  },
  {
    n: 73,
    line: V,
    company: 50,
    trail: T.LOST_AFTER_PROPOSAL,
    owner: "zainab",
    age: 44,
    last: 9,
    score: 70,
  },
  {
    n: 74,
    line: V,
    company: 13,
    trail: T.NURTURE_REENGAGED,
    owner: "videoLead",
    age: 90,
    last: 2,
    score: 66,
    nurtureReason: "REENGAGE",
    nextActionIn: 5,
    nextActionNote: "Re-engage: new season of classes starting",
  },
  {
    n: 75,
    line: V,
    company: 40,
    trail: T.DISQUALIFIED_AT_AUDIT,
    owner: "zainab",
    age: 10,
    last: 9,
    disqualifyReason: "disqualifier:in_house_team",
  },
  {
    n: 76,
    line: V,
    company: 43,
    trail: T.SUPPRESSED_AFTER_CONTACT,
    owner: "videoLead",
    age: 20,
    last: 7,
    score: 67,
    contact: 1,
  },
];

/** Lead numbers with a special role in the rest of the seed. */
export const KEY_LEADS = {
  crossSellLeader: 8,
  crossSellHeld: 44,
  borderline: 7,
  needsEditDraft: 9,
  rejectedDraft: 45,
  linkedInCompliance: 28,
  outOfOffice: 12,
  wrongPerson: 30,
  otherReply: 68,
  whatsappUnsubscribe: 20,
  oneClickUnsubscribe: 38,
  domainSuppressed: 57,
  hardBounce: 76,
  noWebsiteAudit: 5,
  instagramNotAssessed: 43,
  checkFailed: 26,
  dismissedFinding: 27,
  activeClientWin: 72,
} as const;

export function leadStatus(spec: LeadSpec): LeadStatus {
  const status = spec.trail.at(-1);
  if (status === undefined) throw new Error(`Seed lead ${String(spec.n)} has an empty trail.`);
  return status;
}
