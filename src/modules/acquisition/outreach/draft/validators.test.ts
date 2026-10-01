import { describe, expect, it } from "vitest";

import { validateDraftShape, wordCount } from "./validators";

describe("validateDraftShape — email", () => {
  it("accepts a clean first-touch email", () => {
    const result = validateDraftShape({
      channel: "EMAIL",
      isFirstTouch: true,
      subject: "A note on your website speed",
      body: "Hi there, your homepage is slow on mobile. A faster build would help your visitors.",
      allowedLinks: [],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an over-long subject", () => {
    const result = validateDraftShape({
      channel: "EMAIL",
      isFirstTouch: true,
      subject: "x".repeat(61),
      body: "Short body.",
      allowedLinks: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Subject");
  });

  it("rejects exclamation marks in a first touch", () => {
    const result = validateDraftShape({ channel: "EMAIL", isFirstTouch: true, subject: "Hello", body: "Great news!", allowedLinks: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects a banned phrase", () => {
    const result = validateDraftShape({ channel: "EMAIL", isFirstTouch: true, subject: "Hello", body: "Let me reach out about this.", allowedLinks: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("reach out");
  });

  it("rejects a fake Re: subject", () => {
    const result = validateDraftShape({ channel: "EMAIL", isFirstTouch: true, subject: "Re: our chat", body: "Body.", allowedLinks: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects a link that is not allow-listed", () => {
    const result = validateDraftShape({ channel: "EMAIL", isFirstTouch: true, subject: "Hello", body: "See https://evil.example/x", allowedLinks: ["https://futureuni.dev/work"] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Link not allowed");
  });

  it("allows an allow-listed link", () => {
    const result = validateDraftShape({ channel: "EMAIL", isFirstTouch: true, subject: "Hello", body: "See https://futureuni.dev/work", allowedLinks: ["https://futureuni.dev/work"] });
    expect(result.ok).toBe(true);
  });

  it("limits follow-up body length", () => {
    const body = Array.from({ length: 95 }, () => "word").join(" ");
    const result = validateDraftShape({ channel: "EMAIL", isFirstTouch: false, subject: null, body, allowedLinks: [] });
    expect(result.ok).toBe(false);
  });
});

describe("validateDraftShape — WhatsApp", () => {
  it("requires FUTUREUNI on the first line", () => {
    const result = validateDraftShape({ channel: "WHATSAPP_ASSISTED", isFirstTouch: true, subject: null, body: "Hello from a studio", allowedLinks: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("FUTUREUNI");
  });

  it("accepts a short message that names FUTUREUNI", () => {
    const result = validateDraftShape({ channel: "WHATSAPP_ASSISTED", isFirstTouch: true, subject: null, body: "FUTUREUNI here. We noticed your thumbnails are hard to read on a phone.", allowedLinks: [] });
    expect(result.ok).toBe(true);
  });

  it("allows at most one link", () => {
    const result = validateDraftShape({
      channel: "WHATSAPP_ASSISTED",
      isFirstTouch: true,
      subject: null,
      body: "FUTUREUNI here https://a.example/x and https://b.example/y",
      allowedLinks: ["https://a.example/x", "https://b.example/y"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("one link");
  });
});

describe("validateDraftShape — LinkedIn", () => {
  it("rejects over 300 characters", () => {
    const result = validateDraftShape({ channel: "LINKEDIN_ASSISTED", isFirstTouch: true, subject: null, body: "x".repeat(301), allowedLinks: [] });
    expect(result.ok).toBe(false);
  });
});

describe("wordCount", () => {
  it("counts words", () => {
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });
});
