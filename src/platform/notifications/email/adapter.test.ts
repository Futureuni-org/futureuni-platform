/**
 * The sender selection (ADR-005). The bug this guards against shipped to production: `MOCKS=true`
 * made every platform email go to the in-memory outbox while the UI reported "Invite sent", so
 * invites were silently never delivered.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({ value: false }));
const envState = vi.hoisted(() => {
  const value: Record<string, unknown> = {};
  return { value };
});
const smtp = vi.hoisted(() => ({
  sent: [] as Record<string, unknown>[],
  rejected: [] as string[],
}));

vi.mock("@/env", () => ({
  get env() {
    return envState.value;
  },
  isProviderLive: (id: string) => id === "resend" && live.value,
}));

// The live Resend sender resolves a key before any request. Stubbed so the test neither touches
// the credentials vault (and therefore the database) nor makes a network call.
vi.mock("@/platform/credentials", () => ({
  resolveProviderKey: () => Promise.resolve(null),
}));

// Stub nodemailer so the SMTP path opens no socket. Records what it was asked to send.
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: (opts: Record<string, unknown>) => {
        smtp.sent.push(opts);
        return Promise.resolve({
          messageId: "<smtp-test-id@futureuni.org>",
          rejected: smtp.rejected,
        });
      },
    }),
  },
}));

async function load(env: Record<string, unknown>, isLive = false) {
  live.value = isLive;
  envState.value = env;
  vi.resetModules();
  return import("./adapter");
}

afterEach(() => {
  vi.resetModules();
  smtp.sent.length = 0;
  smtp.rejected.length = 0;
});

const payload = {
  to: "ada@example.com",
  from: "FUTUREUNI Platform <info@futureuni.org>",
  subject: "You're invited",
  html: "<p>hello</p>",
  text: "hello",
};

describe("platform email sender", () => {
  it("writes to the in-memory outbox while Resend is mocked", async () => {
    const { getEmailSender, getMockOutbox, clearMockOutbox, isEmailLive } = await load({}, false);
    clearMockOutbox();
    expect(isEmailLive()).toBe(false);

    const result = await getEmailSender().send(payload);

    expect(result.providerMessageId).toMatch(/^mock-/);
    expect(getMockOutbox()).toHaveLength(1);
  });

  it("stops using the outbox once Resend is live", async () => {
    const { getEmailSender, getMockOutbox, clearMockOutbox, isEmailLive } = await load({}, true);
    clearMockOutbox();
    expect(isEmailLive()).toBe(true);

    // With no key configured the live sender fails loudly rather than quietly swallowing the
    // message — and, critically, nothing lands in the outbox, proving the mock is out of the path.
    await expect(getEmailSender().send(payload)).rejects.toThrow(/Resend API key not configured/);
    expect(getMockOutbox()).toHaveLength(0);
  });

  it("sends through SMTP when EMAIL_TRANSPORT=smtp, not the outbox", async () => {
    const { getEmailSender, getMockOutbox, clearMockOutbox, isEmailLive, emailTransport } =
      await load({
        EMAIL_TRANSPORT: "smtp",
        EMAIL_SMTP_HOST: "smtp.hostinger.com",
        EMAIL_SMTP_PORT: 465,
        EMAIL_SMTP_USER: "info@futureuni.org",
        EMAIL_SMTP_PASSWORD: "secret",
      });
    clearMockOutbox();
    expect(emailTransport()).toBe("smtp");
    expect(isEmailLive()).toBe(true);

    const result = await getEmailSender().send(payload);

    expect(result.providerMessageId).toBe("<smtp-test-id@futureuni.org>");
    expect(smtp.sent).toHaveLength(1);
    expect(smtp.sent[0]).toMatchObject({ from: payload.from, to: payload.to });
    expect(getMockOutbox()).toHaveLength(0);
  });

  it("surfaces an SMTP recipient rejection", async () => {
    smtp.rejected.push("ada@example.com");
    const { getEmailSender } = await load({
      EMAIL_TRANSPORT: "smtp",
      EMAIL_SMTP_HOST: "smtp.hostinger.com",
      EMAIL_SMTP_PORT: 465,
      EMAIL_SMTP_USER: "info@futureuni.org",
      EMAIL_SMTP_PASSWORD: "secret",
    });
    await expect(getEmailSender().send(payload)).rejects.toThrow(/SMTP rejected/);
  });
});
