/**
 * The SMTP outreach sender (ADR-016). No real network: nodemailer, the credentials vault and
 * storage are stubbed. Verifies it reads per-mailbox creds, preserves our Message-ID and the
 * RFC 8058 unsubscribe headers, threads via In-Reply-To, and fails loudly on a rejection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import type { OutboundEmail } from "@/contracts/outreach-channel";

const cred = vi.hoisted((): { value: unknown } => ({ value: null }));
const smtp = vi.hoisted(() => ({
  sent: [] as Record<string, unknown>[],
  rejected: [] as string[],
  messageId: "<provider-stored-id@smtp.example>",
  throwOnSend: false,
}));

vi.mock("@/platform/credentials", () => ({
  getCredential: () => Promise.resolve(cred.value),
}));
vi.mock("@/platform/storage", () => ({
  readFile: () => Promise.resolve(Buffer.from("attachment")),
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: (opts: Record<string, unknown>) => {
        if (smtp.throwOnSend) return Promise.reject(new Error("connect ECONNREFUSED"));
        smtp.sent.push(opts);
        return Promise.resolve({ messageId: smtp.messageId, rejected: smtp.rejected });
      },
    }),
  },
}));

import { smtpEmailSender } from "./smtp";

const clock = { now: () => new Date("2026-10-20T10:00:00.000Z") };
const ctx = {
  mailboxId: "mbx1",
  credentialProvider: "outreach-mailbox:cm1mbx00000000000000000001" as never,
  clock,
};

const validCreds = {
  host: "smtp.zoho.com",
  port: 465,
  user: "hello@go.futureuni.org",
  pass: "secret",
};

function email(overrides: Partial<OutboundEmail> = {}): OutboundEmail {
  return {
    messageId: "cm1msg00000000000000000001",
    from: { address: "hello@go.futureuni.org", name: "Prince at FUTUREUNI" },
    to: { address: "owner@prospect.example", name: "Ada" },
    subject: "A quick idea for your site",
    text: "Hi Ada, ...\n\nUnsubscribe below.",
    headers: {
      "Message-ID": "<cm1msg1@go.futureuni.org>",
      "List-Unsubscribe": "<https://futureuni-platform.vercel.app/api/unsubscribe/tok>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    attachments: [],
    ...overrides,
  };
}

beforeEach(() => {
  cred.value = { ...validCreds };
  smtp.sent.length = 0;
  smtp.rejected.length = 0;
  smtp.throwOnSend = false;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("smtp outreach sender", () => {
  it("throws PROVIDER_ERROR when the mailbox has no stored credentials", async () => {
    cred.value = null;
    await expect(smtpEmailSender.send(email(), ctx)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(smtp.sent).toHaveLength(0);
  });

  it("preserves our Message-ID and the unsubscribe headers, and threads on In-Reply-To", async () => {
    await smtpEmailSender.send(
      email({
        headers: {
          "Message-ID": "<cm1msg1@go.futureuni.org>",
          "In-Reply-To": "<prev@prospect.example>",
          References: "<prev@prospect.example>",
          "List-Unsubscribe": "<https://futureuni-platform.vercel.app/api/unsubscribe/tok>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      ctx,
    );
    expect(smtp.sent).toHaveLength(1);
    const opts = smtp.sent[0];
    expect(opts).toBeDefined();
    expect(opts?.messageId).toBe("<cm1msg1@go.futureuni.org>");
    expect(opts?.inReplyTo).toBe("<prev@prospect.example>");
    expect(opts?.references).toBe("<prev@prospect.example>");
    expect(opts?.headers).toMatchObject({
      "List-Unsubscribe": "<https://futureuni-platform.vercel.app/api/unsubscribe/tok>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("returns our Message-ID as rfcMessageId and the provider's id as providerMessageId", async () => {
    const result = await smtpEmailSender.send(email(), ctx);
    expect(result.rfcMessageId).toBe("<cm1msg1@go.futureuni.org>");
    expect(result.providerMessageId).toBe(smtp.messageId);
    expect(result.acceptedAt).toBe("2026-10-20T10:00:00.000Z");
  });

  it("throws PROVIDER_ERROR when SMTP rejects the recipient", async () => {
    smtp.rejected.push("owner@prospect.example");
    await expect(smtpEmailSender.send(email(), ctx)).rejects.toBeInstanceOf(AppError);
    await expect(smtpEmailSender.send(email(), ctx)).rejects.toThrow(/rejected/i);
  });

  it("wraps a transport failure as PROVIDER_ERROR", async () => {
    smtp.throwOnSend = true;
    await expect(smtpEmailSender.send(email(), ctx)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});
