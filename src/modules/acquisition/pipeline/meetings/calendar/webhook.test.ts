import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseCalComWebhook, verifyCalComSignature } from "./webhook";

const SECRET = "test-cal-webhook-secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function bookingBody(trigger: string, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    triggerEvent: trigger,
    payload: {
      uid: "booking_abc123",
      startTime: "2026-10-20T14:00:00Z",
      endTime: "2026-10-20T14:30:00Z",
      location: "https://meet.google.com/xyz",
      attendees: [{ email: "ada@lagosinteriors.ng", name: "Ada", timeZone: "Africa/Lagos" }],
      responses: { leadRef: { value: "cm1lead0000000000000000042.sigpart" } },
      ...over,
    },
  });
}

describe("verifyCalComSignature", () => {
  it("accepts a correct signature", () => {
    const body = bookingBody("BOOKING_CREATED");
    expect(verifyCalComSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a wrong signature (AC-33.2)", () => {
    const body = bookingBody("BOOKING_CREATED");
    expect(verifyCalComSignature(body, "deadbeef", SECRET)).toBe(false);
  });

  it("rejects a missing signature or missing secret", () => {
    const body = bookingBody("BOOKING_CREATED");
    expect(verifyCalComSignature(body, null, SECRET)).toBe(false);
    expect(verifyCalComSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe("parseCalComWebhook", () => {
  it("normalises a BOOKING_CREATED with a leadRef", () => {
    const parsed = parseCalComWebhook(bookingBody("BOOKING_CREATED"));
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("CREATED");
    expect(parsed?.bookingUid).toBe("booking_abc123");
    expect(parsed?.leadRef).toBe("cm1lead0000000000000000042.sigpart");
    expect(parsed?.attendeeEmail).toBe("ada@lagosinteriors.ng");
    expect(parsed?.timezone).toBe("Africa/Lagos");
    expect(parsed?.location).toBe("https://meet.google.com/xyz");
    expect(parsed?.startsAt.toISOString()).toBe("2026-10-20T14:00:00.000Z");
  });

  it("reads leadRef from metadata when there's no booking-field response", () => {
    const parsed = parseCalComWebhook(
      bookingBody("BOOKING_CREATED", { responses: {}, metadata: { leadRef: "cm1lead0000000000000000099.sig" } }),
    );
    expect(parsed?.leadRef).toBe("cm1lead0000000000000000099.sig");
  });

  it("maps reschedule and cancel triggers", () => {
    expect(parseCalComWebhook(bookingBody("BOOKING_RESCHEDULED"))?.kind).toBe("RESCHEDULED");
    expect(parseCalComWebhook(bookingBody("BOOKING_CANCELLED"))?.kind).toBe("CANCELLED");
  });

  it("gives distinct dedupe event ids per trigger", () => {
    const created = parseCalComWebhook(bookingBody("BOOKING_CREATED"))?.eventId;
    const cancelled = parseCalComWebhook(bookingBody("BOOKING_CANCELLED"))?.eventId;
    expect(created).not.toBe(cancelled);
  });

  it("ignores unknown triggers and malformed bodies", () => {
    expect(parseCalComWebhook(bookingBody("BOOKING_PAID"))).toBeNull();
    expect(parseCalComWebhook("not json")).toBeNull();
    expect(parseCalComWebhook(JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: {} }))).toBeNull();
  });
});
