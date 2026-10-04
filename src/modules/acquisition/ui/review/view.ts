import type { Market, ServiceLine } from "@/contracts/common";

/**
 * Serialisable view shapes for the review queue. The queue list and each draft come from
 * `getReviewQueue`; the heavier per-lead context (score reasons, contactability, cross-sell,
 * findings) is fetched on focus via a server action.
 */

export const REJECT_REASONS = [
  { value: "WRONG_FACTS", label: "Wrong facts" },
  { value: "TONE", label: "Wrong tone" },
  { value: "NOT_A_FIT", label: "Not a fit" },
  { value: "WRONG_CONTACT", label: "Wrong contact" },
  { value: "COMPLIANCE", label: "Compliance concern" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "OTHER", label: "Other" },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]["value"];

/** A draft in the queue, with everything needed to render and act on it without a refetch. */
export interface ReviewDraft {
  messageId: string;
  leadId: string;
  companyId: string;
  contactId: string | null;
  channel: string;
  stepIndex: number | null;
  isFirstTouch: boolean;
  subject: string | null;
  body: string;
  citedFindingIds: string[];
  status: string;
  humanEdited: boolean;
  companyName: string;
  companyCountry: string | null;
  companyCity: string | null;
  contactName: string | null;
  contactRole: string | null;
  market: Market;
  serviceLine: ServiceLine;
  score: number | null;
  scoreBand: string | null;
  brief: string | null;
  needsHumanReview: boolean;
  complianceReview: boolean;
  heldByCrossSell: boolean;
}

export interface ScoreReasonView {
  ruleId: string;
  label: string;
  points: number;
}

export interface FindingChipView {
  id: string;
  severity: string;
  method: string;
  claim: string;
  sourceUrl: string | null;
  artifactUrl: string | null;
  capturedAt: string;
  pitchable: boolean;
  dismissed: boolean;
}

export interface ChannelVerdictView {
  channel: "email" | "whatsapp" | "linkedin" | "phone";
  status: string;
  reason: string;
}

export interface BorderlineRecommendationView {
  recommendation: string;
  confidence: number;
}

/** The heavy per-lead context, fetched when a draft gains focus. */
export interface ReviewContext {
  leadId: string;
  score: number | null;
  band: string | null;
  reasons: ScoreReasonView[];
  needsHumanReview: boolean;
  recommendation: BorderlineRecommendationView | null;
  verdicts: ChannelVerdictView[];
  complianceReason: string | null;
  crossSell: { isLeading: boolean; otherLines: ServiceLine[] } | null;
  findings: FindingChipView[];
  whatsappConfidence: "CONFIRMED" | "LIKELY" | null;
  companyWebsite: string | null;
  linkedinUrl: string | null;
}

/** The viewer's capabilities, computed on the server and passed to the client. */
export interface ReviewPermissions {
  canApprove: boolean;
  canReject: boolean;
  canDraft: boolean;
  canSendAssisted: boolean;
  canDecideReview: boolean;
}
