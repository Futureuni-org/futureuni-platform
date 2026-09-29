import { afterEach, describe, expect, it } from "vitest";

import { clearMockOutbox, getMockOutbox } from "./email/adapter";
import { _resetNotificationRegistry } from "./registry";
import { updatePreferences } from "./service";

afterEach(() => {
  clearMockOutbox();
  _resetNotificationRegistry();
});

describe("notify()", () => {
  it("rejects an unknown type", async () => {
    const { notify } = await import("./notify");
    await expect(notify({ userIds: ["cu"], type: "does.not.exist", title: "x" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("refuses to mute a critical type", async () => {
    // 'reply.interested' is critical per platform types.
    await expect(
      updatePreferences("cu1", [{ type: "reply.interested", channel: "IN_APP", enabled: false }]),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("mock email sender records outbox entries", async () => {
    const { getEmailSender } = await import("./email/adapter");
    const sender = getEmailSender();
    const result = await sender.send({
      to: "a@example.com",
      from: "notifications@futureuni.example",
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result.providerMessageId).toMatch(/^mock-/);
    expect(getMockOutbox().at(-1)?.to).toBe("a@example.com");
  });
});
