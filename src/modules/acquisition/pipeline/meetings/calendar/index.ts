/**
 * The Cal.com calendar provider and the MOCKS-aware selector. Feature code calls
 * `getCalendarProvider()` and never branches on the mode itself (ADR-005).
 */

import "server-only";

import { env } from "@/env";

import { mockCalendarProvider } from "./mock";
import type { CalendarProvider } from "./types";
import { getCalWebhookSecret, parseCalComWebhook, verifyCalComSignature } from "./webhook";

export const calComProvider: CalendarProvider = {
  id: "cal-com",
  verifySignature: (rawBody, signatureHeader) =>
    verifyCalComSignature(rawBody, signatureHeader, getCalWebhookSecret()),
  parseWebhook: (rawBody) => parseCalComWebhook(rawBody),
};

/**
 * The calendar provider, honouring MOCKS. Only Cal.com is implemented; a second provider would be
 * selected here by the `[provider]` path segment once it exists (the webhook signature gates access
 * regardless).
 */
export function getCalendarProvider(): CalendarProvider {
  return env.MOCKS ? mockCalendarProvider : calComProvider;
}

export type { CalendarProvider, NormalizedBooking, CalendarEventKind } from "./types";
export { getCalWebhookSecret, parseCalComWebhook, verifyCalComSignature } from "./webhook";
