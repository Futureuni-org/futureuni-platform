/**
 * Mock EmailSender (ADR-005). Records every send in memory keyed by messageId, so a repeat call
 * with the same messageId returns the first result (INV-22). It can simulate a provider failure for
 * tests via {@link configureMockSender}. No network.
 */

import { AppError } from "@/lib/errors";
import type { EmailSender, OutboundEmail, SendResultSchema } from "@/contracts/outreach-channel";
import type { z } from "zod";

type SendResult = z.infer<typeof SendResultSchema>;

interface RecordedSend {
  email: OutboundEmail;
  mailboxId: string;
  result: SendResult;
}

const store = new Map<string, RecordedSend>();
let failFor: ((email: OutboundEmail) => boolean) | null = null;

/** Test hook: make the mock throw a provider error for matching emails. */
export function configureMockSender(options: { failFor?: (email: OutboundEmail) => boolean }): void {
  failFor = options.failFor ?? null;
}

/** Test helpers. */
export function resetMockSender(): void {
  store.clear();
  failFor = null;
}
export function getMockSends(): RecordedSend[] {
  return [...store.values()];
}
export function getMockSend(messageId: string): RecordedSend | undefined {
  return store.get(messageId);
}

export const mockEmailSender: EmailSender = {
  id: "mock",
  send(email, ctx) {
    const existing = store.get(email.messageId);
    if (existing !== undefined) return Promise.resolve(existing.result);
    if (failFor?.(email) === true) {
      return Promise.reject(new AppError("PROVIDER_ERROR", "Mock sender simulated a failure."));
    }
    const rfcMessageId = email.headers["Message-ID"];
    const result: SendResult = {
      providerMessageId: `mock-${email.messageId}`,
      providerThreadId: email.providerThreadId ?? `mock-thread-${email.messageId}`,
      rfcMessageId,
      acceptedAt: ctx.clock.now().toISOString(),
    };
    store.set(email.messageId, { email, mailboxId: ctx.mailboxId, result });
    return Promise.resolve(result);
  },
};
