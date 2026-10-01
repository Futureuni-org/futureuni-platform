import { describe, expect, it } from "vitest";

import { OutboundEmailSchema } from "@/contracts/outreach-channel";

import { appendFooter, buildFooter, buildListUnsubscribe, buildMessageIdHeader, buildOutboundEmail } from "./mime";

describe("footer (INV-4)", () => {
  it("includes the signature, the unsubscribe line and the postal address", () => {
    const footer = buildFooter({
      senderName: "Sam Lee",
      senderTitle: "Studio lead",
      unsubscribeUrl: "https://app.example/u/abc.def",
      postalAddress: "1 Marina Road, Lagos, Nigeria",
    });
    expect(footer).toContain("Sam Lee, Studio lead");
    expect(footer).toContain("Not interested? Unsubscribe: https://app.example/u/abc.def");
    expect(footer).toContain("1 Marina Road, Lagos, Nigeria");
  });

  it("omits the title when there is none", () => {
    const footer = buildFooter({ senderName: "Sam", senderTitle: null, unsubscribeUrl: "https://app.example/u/x", postalAddress: "Addr" });
    expect(footer).toContain("Sam\n");
    expect(footer).not.toContain("Sam, ");
  });

  it("appends the footer below a separator", () => {
    expect(appendFooter("Body text.", "FOOTER")).toBe("Body text.\n\n--\nFOOTER");
  });
});

describe("headers", () => {
  it("builds a valid RFC Message-ID", () => {
    const id = buildMessageIdHeader("cmsg000000000000000000001", "sam@out.example.com");
    expect(id).toMatch(/^<[^<>@\s]+@[^<>\s]+>$/);
    expect(id).toBe("<cmsg000000000000000000001@out.example.com>");
  });

  it("builds a List-Unsubscribe with the https link first", () => {
    const value = buildListUnsubscribe("https://app.example/u/abc", "sam@out.example.com");
    expect(value).toMatch(/^<https:\/\/[^>]+>(, <mailto:[^>]+>)?$/);
  });
});

describe("buildOutboundEmail", () => {
  const base = {
    messageId: "cmsg000000000000000000001",
    from: { address: "sam@out.example.com", name: "Sam" },
    to: { address: "ada@acme.example" },
    subject: "Hello",
    text: "Body\n\n--\nFooter",
    unsubscribeUrl: "https://app.example/u/abc",
  };

  it("produces a schema-valid first-touch email with RFC 8058 headers", () => {
    const email = buildOutboundEmail(base);
    expect(() => OutboundEmailSchema.parse(email)).not.toThrow();
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.headers["In-Reply-To"]).toBeUndefined();
  });

  it("threads a follow-up with In-Reply-To and References", () => {
    const email = buildOutboundEmail({
      ...base,
      inReplyTo: "<parent@out.example.com>",
      references: ["<ancestor@out.example.com>"],
      providerThreadId: "thread-1",
    });
    expect(email.headers["In-Reply-To"]).toBe("<parent@out.example.com>");
    expect(email.headers.References).toBe("<ancestor@out.example.com> <parent@out.example.com>");
    expect(email.providerThreadId).toBe("thread-1");
  });
});
