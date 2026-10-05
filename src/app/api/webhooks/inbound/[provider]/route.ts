/**
 * `POST /api/webhooks/inbound/[provider]` — optional push ingestion (ADR-016: Gmail `watch` via
 * Pub/Sub). The notification carries only `{ emailAddress, historyId }`; this handler verifies the
 * caller, acknowledges fast, and enqueues `acquisition.inbox.poll` (idempotent by historyId), which
 * does the real `history.list` work. Polling every 5 minutes remains the reliable fallback, so a
 * dropped push never loses a reply. The proxy allow-lists `/api/webhooks/*`; this handler still
 * verifies the caller itself (saas-api).
 */

import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import { errorResponse } from "@/lib/errors";
import { resolveProviderKey } from "@/platform/credentials";
import { enqueueJob } from "@/platform/jobs";

export const dynamic = "force-dynamic";

/** Constant-time string compare (SEC-3): hash both to a fixed length so neither value nor length leaks. */
export function tokenMatches(token: string | null, expected: string): boolean {
  if (token === null) return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

interface RouteContext {
  params: Promise<{ provider: string }>;
}

interface PubSubEnvelope {
  message?: { data?: string; messageId?: string };
  subscription?: string;
}

const PUSH_ACTOR = { type: "SYSTEM" as const, job: "acquisition.inbox.push" };

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  try {
    const { provider } = await ctx.params;

    // Verify the caller with a shared token held in the provider's vault entry (Gmail Pub/Sub push
    // sends a Bearer token; full OIDC verification is a Phase 21 go-live task). With MOCKS and no
    // secret configured, accept (dev).
    const expected = await resolveProviderKey(provider as never).catch(() => null);
    if (expected !== null) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url).searchParams.get("token");
      if (!tokenMatches(token, expected)) {
        return Response.json({ error: { code: "UNAUTHENTICATED", message: "Bad token." } }, { status: 401 });
      }
    } else if (!env.MOCKS) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "No webhook secret configured." } }, { status: 401 });
    }

    const rawBody = await request.text();
    let historyId = "";
    let emailAddress = "";
    let messageId = "";
    try {
      const envelope = JSON.parse(rawBody) as PubSubEnvelope;
      messageId = envelope.message?.messageId ?? "";
      if (envelope.message?.data !== undefined) {
        const decoded = JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")) as {
          emailAddress?: string;
          historyId?: string | number;
        };
        emailAddress = decoded.emailAddress ?? "";
        historyId = decoded.historyId === undefined ? "" : String(decoded.historyId);
      }
    } catch {
      // Non-Pub/Sub body: still enqueue a poll below.
    }

    // Idempotent: duplicate pushes for the same (provider, historyId|messageId) dedupe to one poll.
    const key = `acquisition.inbox.push:${provider}:${historyId !== "" ? historyId : messageId !== "" ? messageId : new Date().toISOString().slice(0, 16)}`;
    await enqueueJob("acquisition.inbox.poll", {}, { actor: PUSH_ACTOR, idempotencyKey: key });

    return Response.json({ ok: true, mailbox: emailAddress }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
