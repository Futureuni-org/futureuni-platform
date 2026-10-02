/**
 * Normalisation for inbound email (Phase 13, ingest step 3): a sanitised full-text body (HTML
 * converted safely to text) plus a `latestText` with quoted history and signatures stripped, and
 * the small header subset the inbox needs (outreach-channel contract). Attachments are metadata
 * only; raw attachment bytes are never downloaded here.
 */

import type { InboundEmail } from "@/contracts/outreach-channel";

import { htmlToText } from "./html-to-text";
import { stripQuotesAndSignature } from "./strip-quotes";

export { htmlToText } from "./html-to-text";
export { stripQuotesAndSignature } from "./strip-quotes";

/** The header keys the inbox persists on `Reply.headers` (classification + threading + diagnostics). */
const KEPT_HEADER_KEYS = [
  "Message-ID",
  "In-Reply-To",
  "References",
  "From",
  "To",
  "Date",
  "Auto-Submitted",
  "X-Autoreply",
  "X-Auto-Response-Suppress",
  "Precedence",
  "Content-Type",
  "Return-Path",
] as const;

export interface NormalisedBody {
  rawBodySanitized: string;
  latestText: string;
}

/** Produces the sanitised body and the stripped latest text from an inbound email. */
export function normaliseBody(email: Pick<InboundEmail, "textBody" | "htmlBody">): NormalisedBody {
  const text = email.textBody.trim() !== "" ? email.textBody : htmlToText(email.htmlBody ?? "");
  const rawBodySanitized = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const latestText = stripQuotesAndSignature(rawBodySanitized);
  return { rawBodySanitized, latestText };
}

/** Extracts the small header subset the inbox stores, matching case-insensitively. */
export function extractHeaderSubset(email: InboundEmail): Record<string, string> {
  const out: Record<string, string> = {};
  const lower = new Map(Object.entries(email.headers).map(([k, v]) => [k.toLowerCase(), v]));
  for (const key of KEPT_HEADER_KEYS) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined && value !== "") out[key] = value;
  }
  // Fold in the structured fields the adapter already parsed.
  if (email.rfcMessageId !== undefined && out["Message-ID"] === undefined) out["Message-ID"] = email.rfcMessageId;
  if (email.inReplyTo !== undefined) out["In-Reply-To"] = email.inReplyTo;
  if (email.references.length > 0) out.References = email.references.join(" ");
  if (!("From" in out)) out.From = email.from.address;
  if (!("Date" in out)) out.Date = email.date;
  return out;
}
