/**
 * The calendar provider adapter (ADR-021: Cal.com, with a mock). The provider abstracts the one
 * inbound contract Phase 14 needs — the booking webhook: verifying the signature over the raw body
 * and parsing it into a `NormalizedBooking`. Per-lead booking links are plain URLs (the booking
 * question `leadRef` carries the signed reference), so there is no outbound calendar API call.
 */

export type CalendarEventKind = "CREATED" | "RESCHEDULED" | "CANCELLED";

export interface NormalizedBooking {
  provider: "CAL_COM";
  /** Stable id for `WebhookEvent` dedupe. */
  eventId: string;
  kind: CalendarEventKind;
  /** The provider booking id, stored as `Meeting.externalId`. */
  bookingUid: string;
  /** The signed lead reference from the booking's `leadRef` field or metadata, if present. */
  leadRef: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string | null;
  videoUrl: string | null;
  attendeeEmail: string | null;
  attendeeName: string | null;
}

export interface CalendarProvider {
  readonly id: "cal-com" | "mock";
  /** Constant-time HMAC verification over the raw request body. */
  verifySignature(rawBody: string, signatureHeader: string | null): boolean;
  /** Parses a verified body into a normalised booking, or `null` for an event we ignore. */
  parseWebhook(rawBody: string): NormalizedBooking | null;
}
