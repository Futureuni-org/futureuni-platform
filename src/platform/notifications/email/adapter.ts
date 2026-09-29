/**
 * Platform-email adapter (ADR-023). One `EmailSender` interface with two implementations:
 *  - `mock`: writes to an in-memory outbox that tests can read.
 *  - `resend`: uses the Resend SDK; API key from the credentials vault, then env.
 *
 * The choice is made by `MOCKS`; there is no `if (isProd)` in feature code.
 */

import "server-only";

import { env } from "@/env";

export interface EmailPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailSender {
  send(payload: EmailPayload): Promise<EmailSendResult>;
}

// ---- Mock -------------------------------------------------------------------

interface MockOutboxEntry extends EmailPayload {
  sentAt: Date;
  providerMessageId: string;
}

const outbox: MockOutboxEntry[] = [];

export function getMockOutbox(): readonly MockOutboxEntry[] {
  return outbox;
}

export function clearMockOutbox(): void {
  outbox.splice(0, outbox.length);
}

const mockSender: EmailSender = {
  send(payload) {
    const entry: MockOutboxEntry = {
      ...payload,
      sentAt: new Date(),
      providerMessageId: `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    };
    outbox.push(entry);
    // Log without personal data: IDs only (saas-ship, project-rules §Bans). The full outbox is
    // available via `getMockOutbox()` for tests and the dev dashboard.
    process.stdout.write(`[email:mock] queued ${entry.providerMessageId}\n`);
    return Promise.resolve({ providerMessageId: entry.providerMessageId });
  },
};

// ---- Resend -----------------------------------------------------------------

const resendSender: EmailSender = {
  async send(payload) {
    const { resolveProviderKey } = await import("@/platform/credentials");
    const apiKey = await resolveProviderKey("resend");
    if (apiKey === null) {
      throw new Error("Resend API key not configured (vault or RESEND_API_KEY).");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: payload.replyTo,
      }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`Resend rejected the message (${String(response.status)}): ${message.slice(0, 500)}`);
    }
    const body = (await response.json()) as { id?: string };
    return { providerMessageId: body.id ?? "unknown" };
  },
};

/** Selects the sender by `MOCKS`. Tests always get the mock. */
export function getEmailSender(): EmailSender {
  if (env.MOCKS) return mockSender;
  return resendSender;
}
