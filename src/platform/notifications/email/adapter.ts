/**
 * Platform-email adapter (ADR-023). One `EmailSender` interface with three implementations:
 *  - `mock`: writes to an in-memory outbox that tests can read.
 *  - `resend`: posts to the Resend API; key from the credentials vault, then env.
 *  - `smtp`: sends over SMTP (nodemailer). Used for the Hostinger mailbox on the sending domain,
 *    whose SPF/DKIM/DMARC are already live, so mail is inbox-delivered without a provider account.
 *
 * The transport is chosen by `EMAIL_TRANSPORT`, falling back to the `LIVE_PROVIDERS`/`MOCKS` gate
 * for Resend. There is no `if (isProd)` in feature code.
 */

import "server-only";

import { env, isProviderLive } from "@/env";

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
      throw new Error(
        `Resend rejected the message (${String(response.status)}): ${message.slice(0, 500)}`,
      );
    }
    const body = (await response.json()) as { id?: string };
    return { providerMessageId: body.id ?? "unknown" };
  },
};

// ---- SMTP (nodemailer) ------------------------------------------------------

const smtpSender: EmailSender = {
  async send(payload) {
    const host = env.EMAIL_SMTP_HOST;
    const port = env.EMAIL_SMTP_PORT;
    const user = env.EMAIL_SMTP_USER;
    const pass = env.EMAIL_SMTP_PASSWORD;
    if (host === undefined || port === undefined || user === undefined || pass === undefined) {
      throw new Error(
        "SMTP is not fully configured (EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD).",
      );
    }
    // Dynamic import keeps nodemailer out of the test/build graph until a real send runs.
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // implicit TLS on 465; STARTTLS on 587
      auth: { user, pass },
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
    });
    const info = await transport.sendMail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.replyTo === undefined ? {} : { replyTo: payload.replyTo }),
    });
    if (info.rejected.length > 0) {
      throw new Error(`SMTP rejected the recipient(s): ${info.rejected.join(", ")}`);
    }
    return { providerMessageId: info.messageId };
  },
};

// ---- Selection --------------------------------------------------------------

export type EmailTransport = "mock" | "resend" | "smtp";

/**
 * The active transport. An explicit `EMAIL_TRANSPORT` wins; otherwise Resend is used only when it
 * is live via `LIVE_PROVIDERS`/`MOCKS`, matching the previous behaviour, and the mock otherwise.
 */
export function emailTransport(): EmailTransport {
  const explicit = env.EMAIL_TRANSPORT;
  if (explicit === "mock" || explicit === "resend" || explicit === "smtp") return explicit;
  return isProviderLive("resend") ? "resend" : "mock";
}

/** True when platform email reaches real inboxes rather than the in-memory outbox. */
export function isEmailLive(): boolean {
  return emailTransport() !== "mock";
}

/** Selects the sender by `EMAIL_TRANSPORT` then the Resend gate. Tests get the mock by default. */
export function getEmailSender(): EmailSender {
  switch (emailTransport()) {
    case "smtp":
      return smtpSender;
    case "resend":
      return resendSender;
    default:
      return mockSender;
  }
}
