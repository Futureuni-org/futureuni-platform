import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock,
  Handshake,
  Inbox,
  Mail,
  MailCheck,
  MailQuestion,
  MessageSquare,
  Pause,
  PhoneOff,
  Send,
  Sparkles,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import type {
  JobStatus,
  LeadStatus,
  MessageStatus,
  ReplyClass,
} from "@/contracts/common";
import { cn } from "@/lib/cn";

/**
 * Single status-meta map — every LeadStatus, MessageStatus, ReplyClass and JobStatus that shows
 * in the UI has one row here. Colour is paired with an icon and a label; status is never shown
 * by colour alone (project-rules).
 */

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface Meta {
  label: string;
  tone: Tone;
  icon: Icon;
}

const LEAD: Record<LeadStatus, Meta> = {
  NEW: { label: "New", tone: "neutral", icon: Sparkles },
  ENRICHING: { label: "Enriching", tone: "info", icon: CircleDashed },
  ENRICHED: { label: "Enriched", tone: "info", icon: CheckCircle2 },
  AUDITING: { label: "Auditing", tone: "info", icon: CircleDashed },
  AUDITED: { label: "Audited", tone: "info", icon: CheckCircle2 },
  SCORED: { label: "Scored", tone: "primary", icon: Circle },
  IN_REVIEW: { label: "In review", tone: "warning", icon: Clock },
  APPROVED: { label: "Approved", tone: "primary", icon: CheckCircle2 },
  CONTACTED: { label: "Contacted", tone: "primary", icon: Send },
  REPLIED: { label: "Replied", tone: "success", icon: MessageSquare },
  MEETING_BOOKED: { label: "Meeting booked", tone: "success", icon: Handshake },
  PROPOSAL_SENT: { label: "Proposal sent", tone: "info", icon: Send },
  WON: { label: "Won", tone: "success", icon: Trophy },
  LOST: { label: "Lost", tone: "danger", icon: X },
  NURTURE: { label: "Nurture", tone: "neutral", icon: Clock },
  DISQUALIFIED: { label: "Disqualified", tone: "danger", icon: XCircle },
  SUPPRESSED: { label: "Suppressed", tone: "warning", icon: PhoneOff },
};

const MESSAGE: Record<MessageStatus, Meta> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: Circle },
  NEEDS_EDIT: { label: "Needs edit", tone: "warning", icon: AlertTriangle },
  APPROVED: { label: "Approved", tone: "primary", icon: CheckCircle2 },
  SCHEDULED: { label: "Scheduled", tone: "info", icon: Clock },
  SENDING: { label: "Sending", tone: "info", icon: Send },
  SENT: { label: "Sent", tone: "success", icon: MailCheck },
  SENT_MOCK: { label: "Sent (mock)", tone: "neutral", icon: MailCheck },
  PREPARED: { label: "Prepared", tone: "info", icon: Mail },
  SENT_ASSISTED: { label: "Sent (assisted)", tone: "success", icon: MailCheck },
  REJECTED: { label: "Rejected", tone: "danger", icon: XCircle },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: X },
  FAILED: { label: "Failed", tone: "danger", icon: AlertTriangle },
  BLOCKED: { label: "Blocked", tone: "danger", icon: PhoneOff },
};

const REPLY: Record<ReplyClass, Meta> = {
  INTERESTED: { label: "Interested", tone: "success", icon: MessageSquare },
  NOT_NOW: { label: "Not now", tone: "warning", icon: Clock },
  WRONG_PERSON: { label: "Wrong person", tone: "info", icon: MailQuestion },
  OBJECTION_PRICE: { label: "Objection: price", tone: "warning", icon: AlertTriangle },
  OBJECTION_OTHER: { label: "Objection", tone: "warning", icon: AlertTriangle },
  QUESTION: { label: "Question", tone: "info", icon: MailQuestion },
  UNSUBSCRIBE: { label: "Unsubscribe", tone: "danger", icon: PhoneOff },
  OUT_OF_OFFICE: { label: "Out of office", tone: "neutral", icon: Pause },
  BOUNCE: { label: "Bounce", tone: "danger", icon: XCircle },
  OTHER: { label: "Other", tone: "neutral", icon: Inbox },
};

const JOB: Record<JobStatus, Meta> = {
  QUEUED: { label: "Queued", tone: "neutral", icon: Clock },
  RUNNING: { label: "Running", tone: "info", icon: CircleDashed },
  SUCCEEDED: { label: "Succeeded", tone: "success", icon: CheckCircle2 },
  FAILED: { label: "Failed", tone: "danger", icon: XCircle },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: X },
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-zone text-muted",
  primary: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export type StatusKind = "lead" | "message" | "reply" | "job";

export function statusMeta(kind: "lead", value: LeadStatus): Meta;
export function statusMeta(kind: "message", value: MessageStatus): Meta;
export function statusMeta(kind: "reply", value: ReplyClass): Meta;
export function statusMeta(kind: "job", value: JobStatus): Meta;
export function statusMeta(kind: StatusKind, value: string): Meta {
  const table =
    kind === "lead" ? LEAD : kind === "message" ? MESSAGE : kind === "reply" ? REPLY : JOB;
  const meta = (table as Record<string, Meta>)[value];
  return meta ?? { label: value, tone: "neutral", icon: Circle };
}

export interface StatusBadgeProps {
  kind: StatusKind;
  value: string;
  className?: string;
  hideIcon?: boolean;
}

/** Colour + icon + label. Never shows status by colour alone (project-rules ban). */
export function StatusBadge({ kind, value, className, hideIcon }: StatusBadgeProps) {
  const meta = statusMeta(kind as "lead", value as LeadStatus);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      {hideIcon !== true && <Icon aria-hidden className="size-3" />}
      {meta.label}
    </span>
  );
}
