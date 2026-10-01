/**
 * The signed lead reference embedded in a per-lead booking link (ADR-021). The link carries the
 * reference as the hidden Cal.com booking question `leadRef` (and `metadata[leadRef]`), so the
 * booking webhook can match the booking back to its lead without trusting an unsigned id.
 *
 * The signature is an HMAC-SHA256 over the lead id with `BOOKING_LINK_SECRET`, compared in constant
 * time. A tampered or unsigned reference verifies to `null`.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

const SEP = ".";

function sign(leadId: string): string {
  return createHmac("sha256", env.BOOKING_LINK_SECRET).update(leadId, "utf8").digest("base64url");
}

/** `<leadId>.<signature>` — a cuid contains no ".", so the last "." splits the two cleanly. */
export function signLeadRef(leadId: string): string {
  return `${leadId}${SEP}${sign(leadId)}`;
}

/** Returns the lead id when the reference's signature is valid, otherwise `null`. */
export function verifyLeadRef(token: string | null | undefined): string | null {
  if (token === null || token === undefined || token === "") return null;
  const index = token.lastIndexOf(SEP);
  if (index <= 0 || index === token.length - 1) return null;
  const leadId = token.slice(0, index);
  const provided = token.slice(index + 1);
  const expected = sign(leadId);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.byteLength !== b.byteLength) return null;
  return timingSafeEqual(a, b) ? leadId : null;
}

/** Appends the signed reference to a booking URL as the `leadRef` prefill parameter. */
export function buildBookingUrl(baseUrl: string, leadRef: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("leadRef", leadRef);
  return url.toString();
}
