/**
 * The sender selection (ADR-005). The bug this guards against shipped to production: `MOCKS=true`
 * made every platform email go to the in-memory outbox while the UI reported "Invite sent", so
 * invites were silently never delivered.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({ value: false }));

vi.mock("@/env", () => ({
  env: {},
  isProviderLive: (id: string) => id === "resend" && live.value,
}));

// The live sender resolves a key before any request. Stubbed so the test neither touches the
// credentials vault (and therefore the database) nor makes a network call.
vi.mock("@/platform/credentials", () => ({
  resolveProviderKey: () => Promise.resolve(null),
}));

async function load(isLive: boolean) {
  live.value = isLive;
  vi.resetModules();
  return import("./adapter");
}

afterEach(() => {
  vi.resetModules();
});

describe("platform email sender", () => {
  it("writes to the in-memory outbox while Resend is mocked", async () => {
    const { getEmailSender, getMockOutbox, clearMockOutbox, isEmailLive } = await load(false);
    clearMockOutbox();
    expect(isEmailLive()).toBe(false);

    const result = await getEmailSender().send({
      to: "ada@example.com",
      from: "FUTUREUNI Platform <notifications@mail.futureuni.org>",
      subject: "You're invited",
      html: "<p>hello</p>",
      text: "hello",
    });

    expect(result.providerMessageId).toMatch(/^mock-/);
    expect(getMockOutbox()).toHaveLength(1);
  });

  it("stops using the outbox once Resend is live", async () => {
    const { getEmailSender, getMockOutbox, clearMockOutbox, isEmailLive } = await load(true);
    clearMockOutbox();
    expect(isEmailLive()).toBe(true);

    // With no key configured the live sender fails loudly rather than quietly swallowing the
    // message — and, critically, nothing lands in the outbox, proving the mock is out of the path.
    await expect(
      getEmailSender().send({
        to: "ada@example.com",
        from: "FUTUREUNI Platform <notifications@mail.futureuni.org>",
        subject: "You're invited",
        html: "<p>hello</p>",
        text: "hello",
      }),
    ).rejects.toThrow(/Resend API key not configured/);
    expect(getMockOutbox()).toHaveLength(0);
  });
});
