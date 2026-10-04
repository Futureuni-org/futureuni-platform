import type {
  Currency,
  DealOutcome,
  HandoffStatus,
  LeadEventKind,
  LeadStatus,
  LostReason,
  MeetingSource,
  MeetingStatus,
  ProposalStatus,
  ServiceLine,
} from "@/contracts/common";
import type {
  MeetingSummary,
  PrecallBrief,
  ProposalSections,
} from "@/contracts/acquisition-records";

/**
 * Plain, serialisable view types for the lead-detail screen (dates are ISO strings). Client-safe:
 * no server-only imports, so both the server loaders and the client components import from here.
 */

/** What the signed-in user may do on this lead. Computed on the server; the services still enforce. */
export interface DetailCapabilities {
  update: boolean;
  assign: boolean;
  rescore: boolean;
  reaudit: boolean;
  disqualify: boolean;
  dismissFinding: boolean;
  decideReview: boolean;
  sendOneOff: boolean;
  manageMeetings: boolean;
  createProposal: boolean;
  approveProposal: boolean;
  approveException: boolean;
  sendProposal: boolean;
  closeDeal: boolean;
  assignHandoff: boolean;
  suppress: boolean;
  /** May handle data-subject requests (`acquisition.dsr.manage`). */
  dataRequest: boolean;
  /** May see what an AI run cost (`platform.aiUsage.read`). */
  seeCosts: boolean;
}

export interface PersonRef {
  id: string;
  name: string;
}

// ---- Evidence ---------------------------------------------------------------------------------

export interface EvidenceArtifact {
  url: string;
  label: string;
  viewport: "mobile" | "desktop" | null;
}

export interface EvidenceMetric {
  key: string;
  value: string;
  threshold: string | null;
}

export interface EvidenceFindingView {
  id: string;
  checkId: string;
  severity: string;
  claim: string;
  method: string;
  confidence: number;
  pitchable: boolean;
  sourceUrl: string | null;
  capturedAt: string;
  dismissedAt: string | null;
  dismissReason: string | null;
  metrics: EvidenceMetric[];
  observations: string[];
  quotes: { text: string; sourceUrl: string | null }[];
  artifacts: EvidenceArtifact[];
}

export interface EvidenceAuditView {
  id: string;
  agentId: string;
  status: string;
  /** What the audit cost, formatted on the server. Null when the viewer may not see costs. */
  costLabel: string | null;
  finishedAt: string | null;
  notAssessed: { checkId: string; status: string; reason: string | null }[];
  findings: EvidenceFindingView[];
}

// ---- Overview ---------------------------------------------------------------------------------

export interface OverviewView {
  brief: string | null;
  talkingPoints: string[];
  topFindings: { id: string; claim: string; severity: string }[];
  reasons: { ruleId: string; label: string; points: number }[];
  review: {
    recommendation: string;
    confidence: number;
    reasons: string[];
    riskFlags: string[];
    decisionType: string | null;
    humanDecision: string | null;
    overrideNote: string | null;
  } | null;
  signals: {
    id: string;
    signalType: string;
    evidenceText: string;
    sourceUrl: string | null;
    observedAt: string;
    adapterId: string;
  }[];
}

// ---- Meetings ---------------------------------------------------------------------------------

export interface MeetingView {
  id: string;
  status: MeetingStatus;
  source: MeetingSource;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  videoUrl: string | null;
  attendeeName: string | null;
  notes: string | null;
  outcomeNotes: string | null;
  summary: MeetingSummary | null;
  precallBrief: PrecallBrief | null;
  precallGeneratedAt: string | null;
}

// ---- Proposals --------------------------------------------------------------------------------

export interface PackageOption {
  id: string;
  name: string;
  minMinor: number;
  typicalMinor: number;
  maxMinor: number;
  currency: Currency;
}

export interface ProposalLineView {
  packageId: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface ProposalView {
  id: string;
  groupId: string;
  version: number;
  status: ProposalStatus;
  currency: Currency;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** A date with no time (ISO, midnight UTC): show it with `formatDay`. */
  validUntil: string;
  /** The discount as entered: basis points for a percentage, minor units for an amount. */
  discount:
    | { type: "NONE" }
    | { type: "PERCENT"; valueBps: number }
    | { type: "AMOUNT"; valueMinor: number };
  notes: string | null;
  requiresApproval: boolean;
  approvalReason: string | null;
  sentAt: string | null;
  declineReason: string | null;
  pdfUrl: string | null;
  sections: ProposalSections | null;
  lines: ProposalLineView[];
  createdAt: string;
}

/** The server-priced quote preview (INV-17: every figure comes from the pricing service). */
export interface QuotePreview {
  currency: Currency;
  lines: ProposalLineView[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  requiresApproval: boolean;
  /** Plain-language reasons approval is needed (empty when it isn't). */
  approvalReasons: string[];
}

// ---- Deal and handoff -------------------------------------------------------------------------

export interface DealView {
  id: string;
  outcome: DealOutcome;
  valueMinor: number | null;
  currency: Currency | null;
  services: ServiceLine[];
  startDate: string | null;
  notes: string | null;
  lostReason: LostReason | null;
  competitor: string | null;
  lostNote: string | null;
  reengageAt: string | null;
  closedAt: string;
}

export interface HandoffView {
  id: string;
  status: HandoffStatus;
  acknowledgedAt: string | null;
  scope: string[];
  assignments: {
    serviceLine: ServiceLine;
    suggested: PersonRef | null;
    assigned: PersonRef | null;
  }[];
}

// ---- Activity and notes -----------------------------------------------------------------------

export interface ActivityView {
  id: string;
  kind: LeadEventKind;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  actorLabel: string | null;
  reason: string | null;
  createdAt: string;
}

export interface NoteView {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "conversation", label: "Conversation" },
  { id: "meetings", label: "Meetings" },
  { id: "proposals", label: "Proposals" },
  { id: "activity", label: "Activity" },
  { id: "notes", label: "Notes" },
] as const;
export type DetailTabId = (typeof DETAIL_TABS)[number]["id"];

export function parseDetailTab(raw: string | string[] | undefined): DetailTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return DETAIL_TABS.find((t) => t.id === value)?.id ?? "overview";
}
