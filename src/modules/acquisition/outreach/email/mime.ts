/**
 * Builds the outbound email envelope: the system-owned footer (INV-4), the RFC 8058 unsubscribe
 * headers and the threading headers. The model never writes the footer. Pure — no I/O — so the
 * header shape can be unit-tested directly.
 */

import type { OutboundEmail } from "@/contracts/outreach-channel";

export interface FooterInput {
  senderName: string;
  senderTitle: string | null;
  unsubscribeUrl: string; // https://<app>/u/<token>
  postalAddress: string;
}

/** The signature, the unsubscribe line and FUTUREUNI's postal address. No emoji, plain text. */
export function buildFooter(input: FooterInput): string {
  const signature = input.senderTitle === null || input.senderTitle.trim() === ""
    ? input.senderName
    : `${input.senderName}, ${input.senderTitle}`;
  return [
    signature,
    "",
    `Not interested? Unsubscribe: ${input.unsubscribeUrl}`,
    "",
    input.postalAddress,
  ].join("\n");
}

/** Appends the footer to the (already citation-stripped) body with a blank-line separator. */
export function appendFooter(body: string, footer: string): string {
  return `${body.trimEnd()}\n\n--\n${footer}`;
}

const DOMAIN_RE = /@(.+)$/;

/** RFC 5322 Message-ID derived from our Message.id so a resend reuses the same id (INV-22). */
export function buildMessageIdHeader(messageId: string, fromAddress: string): string {
  const domain = DOMAIN_RE.exec(fromAddress)?.[1] ?? "futureuni.invalid";
  return `<${messageId}@${domain}>`;
}

/** `<https://…unsubscribe>, <mailto:…>` — the one-click https link first (RFC 8058). */
export function buildListUnsubscribe(unsubscribeUrl: string, mailboxAddress: string): string {
  return `<${unsubscribeUrl}>, <mailto:${mailboxAddress}?subject=unsubscribe>`;
}

export interface OutboundBuildInput {
  messageId: string;
  from: { address: string; name: string };
  to: { address: string; name?: string };
  subject: string;
  /** Final plain-text body including the footer, with citation markers already removed. */
  text: string;
  unsubscribeUrl: string;
  /** Previous message's RFC Message-ID, for follow-up threading. */
  inReplyTo?: string | null;
  references?: readonly string[];
  providerThreadId?: string | null;
  attachments?: { filename: string; contentType: string; fileKey: string }[];
}

/** Assembles the {@link OutboundEmail} the EmailSender adapter consumes. */
export function buildOutboundEmail(input: OutboundBuildInput): OutboundEmail {
  const messageIdHeader = buildMessageIdHeader(input.messageId, input.from.address);
  const headers: OutboundEmail["headers"] = {
    "Message-ID": messageIdHeader,
    "List-Unsubscribe": buildListUnsubscribe(input.unsubscribeUrl, input.from.address),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  if (input.inReplyTo != null && input.inReplyTo !== "") {
    headers["In-Reply-To"] = input.inReplyTo;
    const refs = [...(input.references ?? []), input.inReplyTo];
    headers.References = refs.join(" ");
  }
  return {
    messageId: input.messageId,
    from: { address: input.from.address, name: input.from.name },
    to: input.to.name === undefined ? { address: input.to.address } : { address: input.to.address, name: input.to.name },
    subject: input.subject,
    text: input.text,
    headers,
    attachments: input.attachments ?? [],
    ...(input.providerThreadId != null && input.providerThreadId !== ""
      ? { providerThreadId: input.providerThreadId }
      : {}),
  };
}
