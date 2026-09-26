import { describe, expect, it } from "vitest";

import { formatMoney, fromMinor, toMinor } from "./money";

describe("formatMoney (common.md rule 8)", () => {
  it("shows whole amounts without minor units in the UI", () => {
    expect(formatMoney({ amountMinor: 25_000_000, currency: "NGN" })).toBe("₦250,000");
    expect(formatMoney({ amountMinor: 120_000, currency: "USD" })).toBe("$1,200");
  });

  it("shows two decimals for part amounts", () => {
    expect(formatMoney({ amountMinor: 125_050, currency: "GBP" })).toBe("£1,250.50");
    expect(formatMoney({ amountMinor: 5, currency: "EUR" })).toBe("€0.05");
  });

  it("always shows decimals for USD, GBP and EUR in documents, and kobo only when present", () => {
    expect(formatMoney({ amountMinor: 480_000, currency: "USD" }, { showMinor: "always" })).toBe(
      "$4,800.00",
    );
    expect(formatMoney({ amountMinor: 215_000, currency: "GBP" }, { showMinor: "always" })).toBe(
      "£2,150.00",
    );
    expect(
      formatMoney({ amountMinor: 125_000_000, currency: "NGN" }, { showMinor: "always" }),
    ).toBe("₦1,250,000");
    expect(
      formatMoney({ amountMinor: 125_000_050, currency: "NGN" }, { showMinor: "always" }),
    ).toBe("₦1,250,000.50");
  });

  it("uses the compact form for charts and stat rows", () => {
    expect(formatMoney({ amountMinor: 420_000_000, currency: "NGN" }, { compact: true })).toBe(
      "₦4.2m",
    );
    expect(formatMoney({ amountMinor: 680_000, currency: "USD" }, { compact: true })).toBe("$6.8k");
    expect(formatMoney({ amountMinor: 210_000, currency: "GBP" }, { compact: true })).toBe("£2.1k");
    expect(formatMoney({ amountMinor: 100_000_000, currency: "NGN" }, { compact: true })).toBe(
      "₦1m",
    );
    expect(formatMoney({ amountMinor: 45_000, currency: "USD" }, { compact: true })).toBe("$450");
  });

  it("moves to the next unit when rounding reaches 1,000 of the current one", () => {
    expect(formatMoney({ amountMinor: 99_999_900, currency: "NGN" }, { compact: true })).toBe(
      "₦1m",
    );
    expect(formatMoney({ amountMinor: 99_995_000_000, currency: "NGN" }, { compact: true })).toBe(
      "₦1bn",
    );
    expect(formatMoney({ amountMinor: 99_940_000, currency: "NGN" }, { compact: true })).toBe(
      "₦999.4k",
    );
  });

  it("formats zero and negative amounts", () => {
    expect(formatMoney({ amountMinor: 0, currency: "USD" })).toBe("$0");
    expect(formatMoney({ amountMinor: -125_050, currency: "GBP" })).toBe("-£1,250.50");
    expect(formatMoney({ amountMinor: -420_000_000, currency: "NGN" }, { compact: true })).toBe(
      "-₦4.2m",
    );
  });

  it("refuses fractional minor units and amounts beyond a safe integer", () => {
    expect(() =>
      formatMoney({ amountMinor: Number.MAX_SAFE_INTEGER + 2, currency: "USD" }),
    ).toThrow(/minor units/);
  });

  it("refuses fractional minor units", () => {
    expect(() => formatMoney({ amountMinor: 1250.5, currency: "GBP" })).toThrow(/minor units/);
  });
});

describe("toMinor", () => {
  it("parses human amounts without float arithmetic", () => {
    expect(toMinor("1,250.50", "GBP")).toBe(125_050);
    expect(toMinor("250000", "NGN")).toBe(25_000_000);
    expect(toMinor("0.1", "USD")).toBe(10);
    expect(toMinor(" 4 800.00 ", "USD")).toBe(480_000);
    // 0.1 + 0.2 in floats is 0.30000000000000004; parsed as text it's exact.
    expect(toMinor("0.30", "EUR")).toBe(30);
  });

  it("rejects too many decimals, negatives and non-numbers with VALIDATION_FAILED", () => {
    expect(() => toMinor("1.005", "GBP")).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() => toMinor("-5", "GBP")).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() => toMinor("ten", "GBP")).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("accepts real thousands groups and refuses a decimal comma or stray separators", () => {
    expect(toMinor("12,345,678.90", "NGN")).toBe(1_234_567_890);
    for (const bad of ["4,50", "1,5", "1 2", "12,34,567", "1,234 567", "99999999999999999999"]) {
      expect(() => toMinor(bad, "EUR"), bad).toThrow(
        expect.objectContaining({ code: "VALIDATION_FAILED" }),
      );
    }
  });
});

describe("fromMinor", () => {
  it("returns a plain decimal string", () => {
    expect(fromMinor(125_050, "GBP")).toBe("1250.50");
    expect(fromMinor(7, "NGN")).toBe("0.07");
    expect(fromMinor(toMinor("1,250.50", "GBP"), "GBP")).toBe("1250.50");
  });
});
