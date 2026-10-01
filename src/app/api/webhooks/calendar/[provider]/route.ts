/**
 * Calendar booking webhook (Phase 14, ADR-021). Public route (no session): it protects itself by
 * verifying the provider's signature over the raw body and deduping by event id (WebhookEvent).
 * The domain work — creating the meeting, moving the lead, stopping enrolments, notifying — runs in
 * the meetings service as the SYSTEM actor.
 */

import "server-only";

import { createHash } from "node:crypto";

import { errorResponse } from "@/lib/errors";
import { verifyLeadRef } from "@/modules/acquisition/pipeline/meetings/booking-link";
import { getCalendarProvider } from "@/modules/acquisition/pipeline/meetings/calendar";
import { handleCalendarBooking } from "@/modules/acquisition/pipeline/meetings/meetings";
import * as repo from "@/modules/acquisition/pipeline/pipeline.repo";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  try {
    const { provider } = await params;
    const rawBody = await request.text();
    const calendar = getCalendarProvider();

    if (!calendar.verifySignature(rawBody, request.headers.get("x-cal-signature-256"))) {
      return Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Invalid webhook signature." } },
        { status: 401 },
      );
    }

    const booking = calendar.parseWebhook(rawBody);
    if (booking === null) return Response.json({ ok: true, ignored: true });

    // Dedupe by event id (events contract: subscribers dedupe on it).
    if ((await repo.findWebhookEvent(provider, booking.eventId)) !== null) {
      return Response.json({ ok: true, duplicate: true });
    }
    const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    let eventRowId: string;
    try {
      eventRowId = await repo.recordWebhookReceived(provider, booking.eventId, payloadHash);
    } catch (error) {
      if (repo.isUniqueViolation(error)) return Response.json({ ok: true, duplicate: true });
      throw error;
    }

    try {
      const outcome = await handleCalendarBooking(booking, verifyLeadRef);
      await repo.markWebhookProcessed(eventRowId, new Date());
      return Response.json({ ok: true, action: outcome.action });
    } catch (error) {
      await repo.markWebhookFailed(eventRowId, error instanceof Error ? error.message : "error");
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
