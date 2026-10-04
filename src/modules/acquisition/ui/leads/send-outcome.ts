import type { MessageStatus } from "@/contracts/common";

import { formatDateTime } from "./format";

/**
 * What actually happened to an email after a send was requested. The send services return only a
 * message id, and the single send path can also schedule the message (outside the sending window,
 * mailbox limit reached) or block it (suppressed, not contactable). The actions read the message's
 * status back and report this, so the screen never says "sent" for an email that wasn't. Client-safe.
 * See CR-16-SEND-OUTCOME in phases/16/REQUESTS.md.
 */
export type Delivery = "sent" | "scheduled" | "blocked" | "pending";

export interface SendResult {
  messageId: string;
  delivery: Delivery;
  /** When a scheduled message will go out (ISO-8601), if known. */
  scheduledFor: string | null;
}

export function deliveryOf(status: MessageStatus | null): Delivery {
  switch (status) {
    case "SENT":
    case "SENT_MOCK":
    case "SENT_ASSISTED":
      return "sent";
    case "SCHEDULED":
      return "scheduled";
    case "BLOCKED":
    case "FAILED":
    case "CANCELLED":
    case "REJECTED":
      return "blocked";
    default:
      return "pending";
  }
}

export interface DeliveryNotice {
  tone: "success" | "info" | "error";
  text: string;
}

/** The sentence to show after a send, for `what` ("Reply", "Email", "Proposal"). */
export function deliveryNotice(what: string, result: SendResult, timezone: string): DeliveryNotice {
  switch (result.delivery) {
    case "sent":
      return { tone: "success", text: `${what} sent.` };
    case "scheduled":
      return {
        tone: "info",
        text:
          result.scheduledFor === null
            ? `${what} scheduled. It will go out in the next sending window.`
            : `${what} scheduled for ${formatDateTime(result.scheduledFor, timezone)}. It couldn't go out now: outside the sending window, or the mailbox has reached its limit.`,
      };
    case "blocked":
      return {
        tone: "error",
        text: `${what} not sent. A compliance or delivery check blocked it. Open the conversation to see why.`,
      };
    case "pending":
      return { tone: "info", text: `${what} queued. It hasn't gone out yet.` };
  }
}
