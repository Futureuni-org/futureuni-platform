import { describe, expect, it } from "vitest";

import {
  MailboxConfigSchema,
  OutboundEmailSchema,
  StopScopeSchema,
  WhatsAppDraftSchema,
} from "./outreach-channel";
import { issuePaths } from "./test-helpers";

const valid = {
  messageId: "cm1msg00000000000000000001",
  from: { address: "tolu@outreach-a.example", name: "Tolu Adeyemi" },
  to: { address: "owner@example.co.uk", name: "Sam Carter" },
  subject: "Your homepage on mobile",
  text: "Hi Sam,\n\nYour homepage took 7.2s to show its main content on mobile in our test on 3 Oct.\n…\n\n—\nTolu Adeyemi, FUTUREUNI\nDon't want these emails? Unsubscribe: https://app.futureuni.example/u/eyJ2IjoxfQ.sig\n<postal address>",
  headers: {
    "Message-ID": "<cm1msg00000000000000000001@outreach-a.example>",
    "List-Unsubscribe":
      "<https://app.futureuni.example/api/unsubscribe/eyJ2IjoxfQ.sig>, <mailto:unsubscribe@outreach-a.example?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
  attachments: [],
};

describe("outreach-channel contract", () => {
  it("parses the worked example (docs/contracts/outreach-channel.md §4)", () => {
    expect(OutboundEmailSchema.parse(valid).headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(
      WhatsAppDraftSchema.safeParse({
        to: "+2348031234567",
        text: "Hello, this is Tolu from FUTUREUNI in Lagos.\nWe looked at your Instagram…",
      }).success,
    ).toBe(true);
  });

  it("rejects the invalid example (§5): mailto-only unsubscribe and no one-click header (INV-4)", () => {
    const result = OutboundEmailSchema.safeParse({
      ...valid,
      headers: { "Message-ID": "<x@y.com>", "List-Unsubscribe": "<mailto:u@y.com>" },
    });
    expect(issuePaths(result).sort()).toEqual([
      "headers.List-Unsubscribe",
      "headers.List-Unsubscribe-Post",
    ]);
  });

  it("a stop needs a scope", () => {
    expect(StopScopeSchema.safeParse({}).success).toBe(false);
    expect(StopScopeSchema.safeParse({ companyId: "cm1comp0000000000000000007" }).success).toBe(
      true,
    );
  });

  it("mailboxes default to the warm-up ramp and the weekday window", () => {
    const mailbox = MailboxConfigSchema.parse({
      id: "cm1mbx00000000000000000001",
      address: "tolu@outreach-a.example",
      displayName: "Tolu Adeyemi",
      provider: "mock",
      credentialProvider: "outreach-mailbox:cm1mbx00000000000000000001",
      status: "WARMING",
      warmupStartDate: "2026-10-01",
    });
    expect(mailbox).toMatchObject({
      warmupStartCap: 5,
      dailyCapTarget: 35,
      warmupRampDays: 24,
      sendWindowStart: "09:00",
    });
  });
});
