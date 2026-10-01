/**
 * Mock calendar provider (ADR-005). Cal.com is the only source of booking webhooks, so the mock
 * shares the real verification and parsing — the webhook body and signature scheme are Cal.com's
 * regardless of mode. The mock exists so the selector has a MOCKS branch and so neither tests nor
 * local development need a real Cal.com API credential.
 */

import "server-only";

import type { CalendarProvider } from "./types";
import { getCalWebhookSecret, parseCalComWebhook, verifyCalComSignature } from "./webhook";

export const mockCalendarProvider: CalendarProvider = {
  id: "mock",
  verifySignature: (rawBody, signatureHeader) =>
    verifyCalComSignature(rawBody, signatureHeader, getCalWebhookSecret()),
  parseWebhook: (rawBody) => parseCalComWebhook(rawBody),
};
