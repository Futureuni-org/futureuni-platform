import type {
  Channel,
  EmailStatus,
  MessageKind,
  MessageStatus,
  ReplyChannel,
  ReplyClass,
  SlaStatus,
} from "@/contracts/common";

/**
 * Plain, serialisable conversation-thread views (dates as ISO strings), shared by the inbox screen
 * and the lead-detail Conversation tab. Client-safe: no server-only imports.
 */

export interface ThreadCitation {
  id: string;
  claim: string;
}

export interface ThreadMessageView {
  id: string;
  kind: MessageKind;
  status: MessageStatus;
  channel: Channel;
  subject: string | null;
  body: string;
  sentAt: string | null;
  createdAt: string;
  needsPricingApproval: boolean;
  inReplyToReplyId: string | null;
  citations: ThreadCitation[];
}

export interface ThreadActionTaken {
  action: string;
  at: string;
  detail: string | null;
}

export interface ThreadReplyView {
  id: string;
  channel: ReplyChannel;
  classification: ReplyClass | null;
  confidence: number | null;
  summary: string | null;
  text: string;
  receivedAt: string;
  unread: boolean;
  slaStatus: SlaStatus;
  slaDueAt: string | null;
  needsHumanReview: boolean;
  objectionSummary: string | null;
  questions: string[];
  /** A date with no time (ISO-8601, midnight UTC). Show it with `formatDay`. */
  followUpDate: string | null;
  referral: { name: string | null; email: string | null; verification: EmailStatus | null } | null;
  actionsTaken: ThreadActionTaken[];
}

export interface ThreadView {
  messages: ThreadMessageView[];
  replies: ThreadReplyView[];
}

/**
 * A suggested response to a reply that hasn't been sent: composer material, not conversation.
 * Regenerating stores another draft rather than replacing the last, and sending cancels them, so a
 * thread can hold several; none of them was ever sent to the prospect.
 */
export function isReplyDraft(message: ThreadMessageView): boolean {
  return (
    message.inReplyToReplyId !== null &&
    (message.status === "DRAFT" ||
      message.status === "NEEDS_EDIT" ||
      message.status === "CANCELLED")
  );
}

/** The thread as the prospect and the team experienced it: without unsent reply drafts. */
export function conversationOnly(thread: ThreadView): ThreadView {
  return { messages: thread.messages.filter((m) => !isReplyDraft(m)), replies: thread.replies };
}

/** The newest live draft answering `replyId`, for the composer. */
export function draftFor(thread: ThreadView, replyId: string): ThreadMessageView | null {
  const drafts = thread.messages.filter(
    (m) => m.inReplyToReplyId === replyId && (m.status === "DRAFT" || m.status === "NEEDS_EDIT"),
  );
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/**
 * What an outbound message's heading says, from its real status. A message that was scheduled,
 * blocked or never left is in the thread too, and must not read as "sent".
 */
export function messageHeading(status: MessageStatus): string {
  switch (status) {
    case "SENT":
    case "SENT_MOCK":
    case "SENT_ASSISTED":
      return "Sent by FUTUREUNI";
    case "SCHEDULED":
    case "APPROVED":
      return "Scheduled to send";
    case "SENDING":
      return "Sending";
    case "PREPARED":
      return "Prepared, not sent yet";
    case "DRAFT":
    case "NEEDS_EDIT":
      return "Draft";
    case "BLOCKED":
    case "FAILED":
    case "CANCELLED":
    case "REJECTED":
      return "Not sent";
  }
}

/** True once a message has actually gone out to the prospect. */
export function wasSent(status: MessageStatus): boolean {
  return status === "SENT" || status === "SENT_MOCK" || status === "SENT_ASSISTED";
}

/** The newest inbound reply: the one the toolbar and composer act on. */
export function latestReply(thread: ThreadView): ThreadReplyView | null {
  return [...thread.replies].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0] ?? null;
}

/** One chronological entry of the thread, outbound message or inbound reply. */
export type ThreadEntry =
  | { type: "message"; at: string; message: ThreadMessageView }
  | { type: "reply"; at: string; reply: ThreadReplyView };

export function threadEntries(thread: ThreadView): ThreadEntry[] {
  const entries: ThreadEntry[] = [
    ...thread.messages.map((message): ThreadEntry => ({
      type: "message",
      at: message.sentAt ?? message.createdAt,
      message,
    })),
    ...thread.replies.map((reply): ThreadEntry => ({ type: "reply", at: reply.receivedAt, reply })),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
