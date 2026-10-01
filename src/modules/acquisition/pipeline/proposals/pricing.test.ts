import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";

import { effectiveDiscountBps, priceProposal } from "./pricing";

describe("priceProposal", () => {
  it("prices a single package with no discount or tax", () => {
    const result = priceProposal({
      market: "NIGERIA",
      currency: "NGN",
      packages: [{ packageId: "web_business", name: "Business site", quantity: 1, unitPriceMinor: 150_000_000 }],
    });
    expect(result.subtotalMinor).toBe(150_000_000);
    expect(result.discountMinor).toBe(0);
    expect(result.taxMinor).toBe(0);
    expect(result.totalMinor).toBe(150_000_000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ kind: "PACKAGE", packageId: "web_business", totalMinor: 150_000_000 });
  });

  // AC-34.1: web_business (₦1,500,000) with a 5% discount, computed in kobo.
  it("applies a percentage discount in minor units (AC-34.1)", () => {
    const result = priceProposal({
      market: "NIGERIA",
      currency: "NGN",
      packages: [{ packageId: "web_business", name: "Business site", quantity: 1, unitPriceMinor: 150_000_000 }],
      discount: { type: "PERCENT", valueBps: 500 },
    });
    expect(result.discountMinor).toBe(7_500_000);
    expect(result.totalMinor).toBe(142_500_000); // ₦1,425,000
  });

  it("sums packages and custom line items with quantities", () => {
    const result = priceProposal({
      market: "INTERNATIONAL",
      currency: "USD",
      packages: [{ packageId: "web_care", name: "Care plan", quantity: 3, unitPriceMinor: 20_000 }],
      lineItems: [{ description: "Extra landing page", quantity: 2, unitPriceMinor: 50_000 }],
    });
    expect(result.lines.map((l) => l.totalMinor)).toEqual([60_000, 100_000]);
    expect(result.subtotalMinor).toBe(160_000);
    expect(result.totalMinor).toBe(160_000);
  });

  it("applies a fixed-amount discount", () => {
    const result = priceProposal({
      market: "INTERNATIONAL",
      currency: "GBP",
      packages: [{ packageId: "uiux_audit", name: "UX audit", quantity: 1, unitPriceMinor: 200_000 }],
      discount: { type: "AMOUNT", valueMinor: 50_000 },
    });
    expect(result.discountMinor).toBe(50_000);
    expect(result.totalMinor).toBe(150_000);
  });

  it("applies tax after the discount when enabled, and ignores the rate when off", () => {
    const base = {
      market: "NIGERIA" as const,
      currency: "NGN" as const,
      packages: [{ packageId: "web_business", name: "Business site", quantity: 1, unitPriceMinor: 100_000_000 }],
      discount: { type: "PERCENT" as const, valueBps: 1_000 }, // 10% → discount 10,000,000, base 90,000,000
    };
    const taxed = priceProposal({ ...base, tax: { enabled: true, rateBps: 750 } }); // 7.5% VAT
    expect(taxed.discountMinor).toBe(10_000_000);
    expect(taxed.taxMinor).toBe(6_750_000); // 90,000,000 * 7.5%
    expect(taxed.totalMinor).toBe(96_750_000);

    const untaxed = priceProposal({ ...base, tax: { enabled: false, rateBps: 750 } });
    expect(untaxed.taxRateBps).toBe(0);
    expect(untaxed.taxMinor).toBe(0);
    expect(untaxed.totalMinor).toBe(90_000_000);
  });

  it("rounds a percentage discount half-up with integer maths", () => {
    // 12345 * 333bps = 411,088.5 → 411,089 (half away from zero).
    const result = priceProposal({
      market: "INTERNATIONAL",
      currency: "USD",
      lineItems: [{ description: "Odd amount", quantity: 1, unitPriceMinor: 12_345 }],
      discount: { type: "PERCENT", valueBps: 10_000 },
    });
    // full 100% discount of 12,345 is exactly 12,345 (sanity for the integer path)
    expect(result.discountMinor).toBe(12_345);

    const half = priceProposal({
      market: "INTERNATIONAL",
      currency: "USD",
      lineItems: [{ description: "Rounding", quantity: 1, unitPriceMinor: 1_000 }],
      discount: { type: "PERCENT", valueBps: 55 }, // 1000 * 0.55% = 5.5 → 6
    });
    expect(half.discountMinor).toBe(6);
  });

  it("rejects a currency that doesn't match the market (AC-34.5)", () => {
    expect(() =>
      priceProposal({
        market: "NIGERIA",
        currency: "GBP",
        packages: [{ packageId: "web_business", name: "Business site", quantity: 1, unitPriceMinor: 1_000 }],
      }),
    ).toThrow(AppError);
    try {
      priceProposal({
        market: "NIGERIA",
        currency: "GBP",
        packages: [{ packageId: "x", name: "x", quantity: 1, unitPriceMinor: 1_000 }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects a fixed discount larger than the subtotal", () => {
    expect(() =>
      priceProposal({
        market: "INTERNATIONAL",
        currency: "USD",
        lineItems: [{ description: "Small", quantity: 1, unitPriceMinor: 1_000 }],
        discount: { type: "AMOUNT", valueMinor: 2_000 },
      }),
    ).toThrow(/larger than the subtotal/);
  });

  it("rejects an empty proposal", () => {
    expect(() => priceProposal({ market: "NIGERIA", currency: "NGN" })).toThrow(AppError);
  });

  it("expresses a fixed-amount discount as effective basis points", () => {
    const result = priceProposal({
      market: "INTERNATIONAL",
      currency: "USD",
      lineItems: [{ description: "Work", quantity: 1, unitPriceMinor: 100_000 }],
      discount: { type: "AMOUNT", valueMinor: 15_000 }, // 15%
    });
    expect(effectiveDiscountBps(result)).toBe(1_500);
  });
});
