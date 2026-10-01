/**
 * Cal.com webhook verification and parsing (ADR-021). The signature is an HMAC-SHA256 of the raw
 * body in `x-cal-signature-256`, compared in constant time. The payload is parsed leniently (the
 * provider adds fields over time) into a `NormalizedBooking`.
 *
 * The webhook secret is `CALCOM_WEBHOOK_SECRET`. `getCalWebhookSecret` prefers the validated `env`
 * value and falls back to `process.env` so a phase's own integration test can configure it without
 * editing the shared test environment; in production the validated `env` value is authoritative.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "@/env";

import type { CalendarEventKind, NormalizedBooking } from "./types";

export function getCalWebhookSecret(): string | undefined {
  const fromEnv = env.CALCOM_WEBHOOK_SECRET;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const fromProcess = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  return fromProcess !== undefined && fromProcess !== "" ? fromProcess : undefined;
}

/** Verifies an HMAC-SHA256 hex signature of the raw body in constant time. */
export function verifyCalComSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (secret === undefined || signatureHeader === null || signatureHeader === "") return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

const TRIGGER_KIND: Readonly<Record<string, CalendarEventKind>> = {
  BOOKING_CREATED: "CREATED",
  BOOKING_RESCHEDULED: "RESCHEDULED",
  BOOKING_CANCELLED: "CANCELLED",
};

const AttendeeSchema = z
  .object({ email: z.string().optional(), name: z.string().optional(), timeZone: z.string().optional() })
  .loose();

const CalWebhookSchema = z
  .object({
    triggerEvent: z.string(),
    payload: z
      .object({
        uid: z.string().optional(),
        bookingId: z.union([z.number(), z.string()]).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(AttendeeSchema).optional(),
        organizer: z.object({ timeZone: z.string().optional() }).loose().optional(),
        responses: z.record(z.string(), z.unknown()).optional(),
        bookingFieldsResponses: z.record(z.string(), z.unknown()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        videoCallData: z.object({ url: z.string().optional() }).loose().optional(),
      })
      .loose(),
  })
  .loose();

/** Pulls `leadRef` out of a booking field response (string or `{ value }`), metadata, or responses. */
function extractLeadRef(payload: z.infer<typeof CalWebhookSchema>["payload"]): string | null {
  const candidates = [payload.metadata?.leadRef, payload.bookingFieldsResponses?.leadRef, payload.responses?.leadRef];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
    if (typeof candidate === "object" && candidate !== null) {
      const value = (candidate as { value?: unknown }).value;
      if (typeof value === "string" && value !== "") return value;
    }
  }
  return null;
}

export function parseCalComWebhook(rawBody: string): NormalizedBooking | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = CalWebhookSchema.safeParse(json);
  if (!parsed.success) return null;

  const kind = TRIGGER_KIND[parsed.data.triggerEvent];
  if (kind === undefined) return null;

  const p = parsed.data.payload;
  const bookingUid = p.uid ?? (p.bookingId === undefined ? null : String(p.bookingId));
  if (bookingUid === null || p.startTime === undefined || p.endTime === undefined) return null;

  const startsAt = new Date(p.startTime);
  const endsAt = new Date(p.endTime);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;

  const firstAttendee = p.attendees?.[0];
  const timezone = firstAttendee?.timeZone ?? p.organizer?.timeZone ?? "UTC";

  return {
    provider: "CAL_COM",
    eventId: `${parsed.data.triggerEvent}:${bookingUid}:${p.startTime}`,
    kind,
    bookingUid,
    leadRef: extractLeadRef(p),
    startsAt,
    endsAt,
    timezone,
    location: p.location ?? null,
    videoUrl: p.videoCallData?.url ?? null,
    attendeeEmail: firstAttendee?.email ?? null,
    attendeeName: firstAttendee?.name ?? null,
  };
}
