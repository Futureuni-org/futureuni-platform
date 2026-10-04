"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  Mail,
  MailCheck,
  MailQuestion,
  MessageCircle,
  Phone,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { RelativeTime } from "@/components/ui/relative-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";

import { formatDay } from "../leads/format";
import { ToneBadge } from "../leads/tone-badge";
import {
  messageHeading,
  threadEntries,
  wasSent,
  type ThreadMessageView,
  type ThreadReplyView,
  type ThreadView,
} from "./thread-types";

/**
 * ConversationThread — one lead's outbound messages and inbound replies in time order (Phase 4
 * deferred this composite; a Phase 16 candidate for promotion). Quoted history is collapsed, cited
 * findings sit in a disclosure (reachable by keyboard and touch, not hover alone), and everything a
 * prospect or a model wrote is rendered as text, never as HTML (INV-24).
 */

const CHANNEL: Record<string, { label: string; icon: LucideIcon }> = {
  EMAIL: { label: "Email", icon: Mail },
  WHATSAPP_ASSISTED: { label: "WhatsApp", icon: MessageCircle },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  LINKEDIN_ASSISTED: { label: "LinkedIn", icon: Briefcase },
  LINKEDIN: { label: "LinkedIn", icon: Briefcase },
  CALL_TASK: { label: "Phone", icon: Phone },
  PHONE: { label: "Phone", icon: Phone },
};

const ACTION_LABEL: Record<string, string> = {
  SEQUENCE_STOPPED: "Sequence stopped",
  SEQUENCE_PAUSED: "Sequence paused",
  SUPPRESSED: "Contact suppressed",
  NURTURED: "Moved to nurture",
  STATUS_CHANGED: "Status changed",
  REFERRAL_PROPOSED: "Referral draft proposed",
  BOUNCE_RECORDED: "Bounce recorded",
  OWNER_NOTIFIED: "Owner notified",
  DRAFT_CREATED: "Reply draft created",
  SLA_STARTED: "Response timer started",
  RECLASSIFIED: "Reclassified",
};

const CONFIDENCE = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

const QUOTE_START = /^(>|On .+ wrote:\s*$|-{2,}\s*Original Message|From: .+)/;

// A disclosure's summary line, tall enough to tap (48px) without changing how the text looks.
const SUMMARY =
  "w-fit cursor-pointer rounded py-3.5 text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Split a body into what was written and the quoted history beneath it. */
export function splitQuoted(text: string): { main: string; quoted: string | null } {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => QUOTE_START.test(line.trim()));
  if (start <= 0) return { main: text, quoted: null };
  return {
    main: lines.slice(0, start).join("\n").trimEnd(),
    quoted: lines.slice(start).join("\n"),
  };
}

function Body({ text }: { text: string }) {
  const { main, quoted } = splitQuoted(text);
  return (
    <div className="flex min-w-0 flex-col">
      <p className="break-words whitespace-pre-wrap text-foreground">{main}</p>
      {quoted !== null && (
        <details className="text-sm">
          <summary className={SUMMARY}>Show quoted text</summary>
          <p className="border-l-2 border-border pl-3 break-words whitespace-pre-wrap text-muted">
            {quoted}
          </p>
        </details>
      )}
    </div>
  );
}

function ChannelTag({ channel }: { channel: string }) {
  const meta = CHANNEL[channel] ?? { label: channel, icon: Mail };
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon aria-hidden className="size-3.5" />
      {meta.label}
    </span>
  );
}

function OutboundMessage({ message, timezone }: { message: ThreadMessageView; timezone: string }) {
  const sent = wasSent(message.status);
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg bg-primary-soft/50 px-4 py-3 sm:ml-10">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ArrowUpRight aria-hidden className="size-4 text-muted" />
        <span className="font-medium text-heading">{messageHeading(message.status)}</span>
        <ChannelTag channel={message.channel} />
        <StatusBadge kind="message" value={message.status} />
        {message.needsPricingApproval && (
          <ToneBadge tone="warning" icon={ShieldAlert}>
            Needs pricing approval
          </ToneBadge>
        )}
        {/* Only a message that went out has a sent time; the rest show when they were written. */}
        <span className="text-xs text-muted">
          {!sent && "written "}
          <RelativeTime
            value={sent ? (message.sentAt ?? message.createdAt) : message.createdAt}
            timezone={timezone}
          />
        </span>
      </div>
      {message.subject !== null && (
        <p className="font-medium break-words text-heading">{message.subject}</p>
      )}
      <Body text={message.body} />
      {message.citations.length > 0 && (
        <details className="text-sm">
          <summary className={SUMMARY}>Cited findings ({String(message.citations.length)})</summary>
          <ul className="flex list-disc flex-col gap-1 pl-5 break-words text-foreground">
            {message.citations.map((citation) => (
              <li key={citation.id}>{citation.claim}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function ExtractedData({ reply }: { reply: ThreadReplyView }) {
  const { referral } = reply;
  const hasData =
    reply.followUpDate !== null ||
    referral !== null ||
    reply.objectionSummary !== null ||
    reply.questions.length > 0;
  if (!hasData) return null;

  return (
    <dl className="flex min-w-0 flex-col gap-2 text-sm">
      {reply.followUpDate !== null && (
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted">Follow up</dt>
          <dd className="text-foreground tabular-nums">{formatDay(reply.followUpDate)}</dd>
        </div>
      )}
      {referral !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted">Referral</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2 text-foreground">
            <span className="min-w-0 break-words">
              {[referral.name, referral.email].filter((v) => v !== null).join(" · ")}
            </span>
            {referral.verification !== null &&
              (referral.verification === "VALID" ? (
                <ToneBadge tone="success" icon={MailCheck}>
                  Email verified
                </ToneBadge>
              ) : (
                <ToneBadge tone="neutral" icon={MailQuestion}>
                  Email not verified
                </ToneBadge>
              ))}
          </dd>
        </div>
      )}
      {reply.objectionSummary !== null && (
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted">Objection</dt>
          <dd className="min-w-0 break-words text-foreground">{reply.objectionSummary}</dd>
        </div>
      )}
      {reply.questions.length > 0 && (
        <div className="flex flex-col gap-1">
          <dt className="text-muted">Questions</dt>
          <dd>
            <ul className="flex list-disc flex-col gap-1 pl-5 break-words text-foreground">
              {reply.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

function InboundReply({ reply, timezone }: { reply: ThreadReplyView; timezone: string }) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg bg-zone px-4 py-3 sm:mr-10",
        reply.unread && "reading-rule",
      )}
      data-active={reply.unread ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ArrowDownLeft aria-hidden className="size-4 text-muted" />
        <span className="font-medium text-heading">Reply</span>
        <ChannelTag channel={reply.channel} />
        {reply.classification !== null && <StatusBadge kind="reply" value={reply.classification} />}
        {reply.confidence !== null && (
          <span className="text-xs text-muted">
            {CONFIDENCE.format(reply.confidence)} confident
          </span>
        )}
        {reply.needsHumanReview && <ToneBadge tone="warning">Needs review</ToneBadge>}
        <RelativeTime value={reply.receivedAt} timezone={timezone} className="text-xs" />
      </div>
      <Body text={reply.text} />
      <ExtractedData reply={reply} />
      {reply.actionsTaken.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Actions taken
          </p>
          <ul className="flex flex-col gap-0.5 break-words text-foreground">
            {reply.actionsTaken.map((action) => (
              <li key={`${action.action}|${action.at}|${action.detail ?? ""}`}>
                {ACTION_LABEL[action.action] ?? action.action}
                {action.detail !== null && <span className="text-muted"> · {action.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function ConversationThread({
  thread,
  timezone,
  className,
}: {
  thread: ThreadView;
  timezone: string;
  className?: string;
}) {
  const entries = threadEntries(thread);
  if (entries.length === 0) {
    return <p className="text-muted">No messages have been sent or received yet.</p>;
  }
  return (
    <ol aria-label="Conversation" className={cn("flex min-w-0 flex-col gap-4", className)}>
      {entries.map((entry) =>
        entry.type === "message" ? (
          <OutboundMessage
            key={`m-${entry.message.id}`}
            message={entry.message}
            timezone={timezone}
          />
        ) : (
          <InboundReply key={`r-${entry.reply.id}`} reply={entry.reply} timezone={timezone} />
        ),
      )}
    </ol>
  );
}
