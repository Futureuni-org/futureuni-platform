import { describe, expect, it } from "vitest";

import { stripQuotesAndSignature } from "./strip-quotes";

describe("stripQuotesAndSignature", () => {
  it("strips a Gmail attribution and quoted history", () => {
    const input =
      "Thanks, this is helpful.\n\nOn Mon, Oct 3, 2026 at 2:30 PM Sam Carter <sam@acme.example> wrote:\n> Hi, we looked at your site\n> and spotted some issues.";
    expect(stripQuotesAndSignature(input)).toBe("Thanks, this is helpful.");
  });

  it("strips an Outlook reply header block", () => {
    const input =
      "Yes, let's talk.\n\nFrom: Sam Carter\nSent: Monday, 3 October 2026 14:30\nTo: Tolu\nSubject: Your website\n\nHi, we looked at your site.";
    expect(stripQuotesAndSignature(input)).toBe("Yes, let's talk.");
  });

  it("strips an Apple Mail attribution", () => {
    const input = "Great, go ahead.\n\nOn 3 Oct 2026, at 14:30, Sam Carter wrote:\n\n> original message here";
    expect(stripQuotesAndSignature(input)).toBe("Great, go ahead.");
  });

  it("strips a mobile footer", () => {
    const input = "Sounds good to me\n\nSent from my iPhone";
    expect(stripQuotesAndSignature(input)).toBe("Sounds good to me");
  });

  it("strips a standard -- signature delimiter", () => {
    const input = "Please call me tomorrow.\n\n-- \nJohn Doe\nCEO, Acme";
    expect(stripQuotesAndSignature(input)).toBe("Please call me tomorrow.");
  });

  it("strips an Original Message separator", () => {
    const input = "Reply above the line.\n\n-----Original Message-----\nFrom: Tolu\nSubject: Hi";
    expect(stripQuotesAndSignature(input)).toBe("Reply above the line.");
  });

  it("strips a top-posted reply above a > quote block", () => {
    const input = "Not interested right now.\n> On Monday you wrote:\n> please consider us";
    expect(stripQuotesAndSignature(input)).toBe("Not interested right now.");
  });

  it("never returns empty: a quote-only body falls back to the trimmed original", () => {
    const input = "> only quoted text\n> nothing new";
    expect(stripQuotesAndSignature(input)).not.toBe("");
  });
});
