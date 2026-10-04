import type { LeadStatus } from "@/contracts/common";

import type { DetailCapabilities } from "./detail-types";

/**
 * Which actions a lead offers, by status and permission (module spec US-37). Pure and client-safe,
 * so the header renders from it and the tests assert on it. The allowed-transitions table in
 * `docs/specs/module-acquisition.md` §"Lead lifecycle" is the source: an action only appears where
 * the transition behind it is allowed, and the services still enforce every rule.
 */

export type PrimaryActionId =
  | "draftOutreach"
  | "openReview"
  | "bookMeeting"
  | "createProposal"
  | "markWon"
  | "markLost"
  | "reengage";

export type SecondaryActionId =
  "rescore" | "reaudit" | "snooze" | "nurture" | "disqualify" | "suppress" | "dataRequest";

const PRE_CONTACT: readonly LeadStatus[] = [
  "NEW",
  "ENRICHING",
  "ENRICHED",
  "AUDITING",
  "AUDITED",
  "SCORED",
  "IN_REVIEW",
  "APPROVED",
];
const CONTACTED_OPEN: readonly LeadStatus[] = [
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
];
const REAUDIT_STATUSES: readonly LeadStatus[] = ["ENRICHED", "AUDITING", "AUDITED"];
const PRE_CONTACT_SCORABLE: readonly LeadStatus[] = ["AUDITED", "SCORED", "NURTURE"];

/**
 * Whether a re-audit does anything in this status. The audit run only starts for an enriched lead
 * and only repeats for an audited one; anywhere else it returns without auditing, so the action is
 * not offered (and the server refuses it) rather than reporting a re-audit that didn't happen.
 */
export function canReauditIn(status: LeadStatus): boolean {
  return REAUDIT_STATUSES.includes(status);
}

/**
 * Whether a re-score does anything in this status. Before first contact only audited, scored and
 * nurture leads are scored; a contacted lead has its score refreshed without a status change; a lead
 * in review or approved is left alone.
 */
export function canRescoreIn(status: LeadStatus): boolean {
  return PRE_CONTACT_SCORABLE.includes(status) || CONTACTED_OPEN.includes(status);
}

const PRIMARY_BY_STATUS: Partial<Record<LeadStatus, PrimaryActionId[]>> = {
  SCORED: ["draftOutreach"],
  IN_REVIEW: ["openReview"],
  APPROVED: ["openReview"],
  CONTACTED: ["bookMeeting", "markLost"],
  REPLIED: ["bookMeeting", "createProposal", "markLost"],
  MEETING_BOOKED: ["createProposal", "markWon", "markLost"],
  PROPOSAL_SENT: ["markWon", "markLost"],
  NURTURE: ["reengage", "markLost"],
};

function allowedPrimary(action: PrimaryActionId, caps: DetailCapabilities): boolean {
  switch (action) {
    case "draftOutreach":
    case "openReview":
      return true;
    case "bookMeeting":
      return caps.manageMeetings;
    case "createProposal":
      return caps.createProposal;
    case "markWon":
    case "markLost":
      return caps.closeDeal;
    case "reengage":
      return caps.update;
  }
}

export function primaryActions(status: LeadStatus, caps: DetailCapabilities): PrimaryActionId[] {
  return (PRIMARY_BY_STATUS[status] ?? []).filter((action) => allowedPrimary(action, caps));
}

export function secondaryActions(
  status: LeadStatus,
  caps: DetailCapabilities,
): SecondaryActionId[] {
  const actions: SecondaryActionId[] = [];
  if (caps.rescore && canRescoreIn(status)) actions.push("rescore");
  if (caps.reaudit && canReauditIn(status)) actions.push("reaudit");
  // Before first contact a lead is snoozed (no status change); after it, parked in nurture.
  if (caps.update && PRE_CONTACT.includes(status)) actions.push("snooze");
  if (caps.update && CONTACTED_OPEN.includes(status)) actions.push("nurture");
  if (caps.disqualify && (PRE_CONTACT.includes(status) || status === "NURTURE")) {
    actions.push("disqualify");
  }
  if (caps.suppress && status !== "WON" && status !== "SUPPRESSED") actions.push("suppress");
  if (caps.dataRequest) actions.push("dataRequest");
  return actions;
}

export const PRIMARY_LABEL: Record<PrimaryActionId, string> = {
  draftOutreach: "Draft outreach",
  openReview: "Open in review queue",
  bookMeeting: "Book meeting",
  createProposal: "Create proposal",
  markWon: "Mark won",
  markLost: "Mark lost",
  reengage: "Re-engage",
};

export const SECONDARY_LABEL: Record<SecondaryActionId, string> = {
  rescore: "Re-score",
  reaudit: "Re-audit",
  snooze: "Snooze",
  nurture: "Move to nurture",
  disqualify: "Disqualify",
  suppress: "Add to suppression",
  dataRequest: "Data request",
};
