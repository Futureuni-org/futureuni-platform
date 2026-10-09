/**
 * `POST /api/webhooks/outbound/[provider]` — provider delivery/bounce/complaint events (Phase 12,
 * step 4.5). The signature is verified against the raw body (HMAC-SHA256, hex, `x-webhook-signature`)
 * with the provider's vault secret; events are deduped by `(provider, eventId)` and processed. A
 * bounce flows through `recordBounce` (INV-2, INV-3). The proxy allow-lists `/api/webhooks/*`; this
 * handler still verifies the signature itself (saas-api).
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { OutboundProviderEventSchema } from "@/contracts/outreach-channel";
import { env } from "@/env";
import { errorResponse } from "@/lib/errors";
import { db } from "@/platform/db";
import { resolveWebhookSecret } from "@/platform/credentials";
import { recordBounce } from "@/modules/acquisition/outreach/email/bounces";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

const PayloadSchema = z.union([OutboundProviderEventSchema, z.array(OutboundProviderEventSchema)]);

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (signature === null) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  try {
    const { provider } = await ctx.params;
    const rawBody = await request.text();

    // Verify the signature against the provider's secret, resolved with `resolveWebhookSecret` so
    // that mock mode cannot downgrade authentication on a public endpoint. Running unverified is a
    // local-development convenience only: on a deployment a missing secret is a 401. Previously
    // MOCKS=true with an empty vault let anyone post forged bounce and unsubscribe events, which
    // suppress contacts and stop enrolments (INV-3).
    const secret = await resolveWebhookSecret(provider as never).catch(() => null);
    if (secret !== null) {
      const ok = verifySignature(rawBody, request.headers.get("x-webhook-signature"), secret);
      if (!ok)
        return Response.json(
          { error: { code: "UNAUTHENTICATED", message: "Bad signature." } },
          { status: 401 },
        );
    } else if (env.VERCEL === "1" || !env.MOCKS) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "No webhook secret configured." } },
        { status: 401 },
      );
    }

    const parsed = PayloadSchema.safeParse(JSON.parse(rawBody) as unknown);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION_FAILED", message: "Bad payload." } },
        { status: 422 },
      );
    }
    const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    let processed = 0;
    for (const event of events) {
      // Dedupe by (provider, eventId).
      const already = await db.trackingEvent.findFirst({
        where: { provider, providerEventId: event.eventId },
        select: { id: true },
      });
      if (already !== null) continue;

      if (event.type === "BOUNCED_HARD" || event.type === "BOUNCED_SOFT") {
        await recordBounce(null, {
          ...(event.providerMessageId === undefined
            ? {}
            : { providerMessageId: event.providerMessageId }),
          email: event.email ?? "unknown@invalid.example",
          kind: event.type === "BOUNCED_HARD" ? "HARD" : "SOFT",
          detail: event.detail ?? event.type,
        });
      }

      await db.trackingEvent.create({
        data: {
          type: event.type,
          provider,
          providerEventId: event.eventId,
          occurredAt: new Date(event.occurredAt),
          payload: { detail: event.detail ?? null, email: event.email ?? null },
        },
      });
      processed += 1;
    }

    return Response.json({ processed }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
