import "server-only";

/**
 * Signed unsubscribe tokens (RFC 8058; outreach-channel contract). A token is
 * `base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(JSON(payload), UNSUBSCRIBE_TOKEN_SECRET))`.
 * It carries the contact, message and scope, has no expiry, and is revocable through
 * `Message.unsubscribeTokenId` / `unsubscribeRevokedAt` (the one-click endpoint checks the row).
 *
 * The token itself holds no secret and is safe to place in an email header and a public URL.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  UnsubscribeTokenPayloadSchema,
  type SignUnsubscribeToken,
  type VerifyUnsubscribeToken,
} from "@/contracts/outreach-channel";
import { env } from "@/env";

type Payload = Parameters<SignUnsubscribeToken>[0];

function hmac(serialisedPayload: string): Buffer {
  return createHmac("sha256", env.UNSUBSCRIBE_TOKEN_SECRET).update(serialisedPayload, "utf8").digest();
}

/** Deterministic serialisation so a verify recomputes the exact bytes that were signed. */
function serialise(payload: Payload): string {
  return JSON.stringify({ v: payload.v, tid: payload.tid, mid: payload.mid, cid: payload.cid, scope: payload.scope });
}

export const signUnsubscribeToken: SignUnsubscribeToken = (payload) => {
  const json = serialise(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const sig = hmac(json).toString("base64url");
  return `${body}.${sig}`;
};

export const verifyUnsubscribeToken: VerifyUnsubscribeToken = (token) => {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const bodyPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let json: string;
  try {
    json = Buffer.from(bodyPart, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = hmac(json);
  let given: Buffer;
  try {
    given = Buffer.from(sigPart, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    return null;
  }
  const result = UnsubscribeTokenPayloadSchema.safeParse(parsedJson);
  return result.success ? result.data : null;
};
