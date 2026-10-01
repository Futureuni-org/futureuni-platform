/**
 * Deterministic proposal pricing (INV-11, INV-17). A pure function: no I/O, no clock, no model.
 * Every amount is an integer count of minor units (kobo / cents / pence); nothing here does
 * floating-point arithmetic on money. The AI drafting task may only restate these figures, and the
 * number-consistency check (`./number-check`) rejects any other number.
 *
 * Rounding rule: percentage discount and tax are rounded half-up (round half away from zero) to the
 * nearest minor unit, computed with integer arithmetic only — `floor((base * bps + 5000) / 10000)`,
 * where `base * bps` is an exact integer well within `Number.MAX_SAFE_INTEGER` at our amounts.
 */

import { z } from "zod";

import {
  CurrencySchema,
  MARKET_CURRENCIES,
  MarketSchema,
  MinorUnitsSchema,
  type Currency,
} from "@/contracts/common";
import { AppError } from "@/lib/errors";

/** Basis points: 1% = 100 bps, 100% = 10 000 bps. */
const BPS_DENOMINATOR = 10_000;

export const PricingPackageLineSchema = z.object({
  packageId: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  quantity: z.int().min(1).max(100),
  unitPriceMinor: MinorUnitsSchema,
});
export type PricingPackageLine = z.infer<typeof PricingPackageLineSchema>;

export const PricingCustomLineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.int().min(1).max(1_000),
  unitPriceMinor: MinorUnitsSchema,
});
export type PricingCustomLine = z.infer<typeof PricingCustomLineSchema>;

export const PricingDiscountSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }),
  z.object({ type: z.literal("PERCENT"), valueBps: z.int().min(0).max(BPS_DENOMINATOR) }),
  z.object({ type: z.literal("AMOUNT"), valueMinor: MinorUnitsSchema }),
]);
export type PricingDiscount = z.infer<typeof PricingDiscountSchema>;

export const PriceProposalInputSchema = z
  .object({
    market: MarketSchema,
    currency: CurrencySchema,
    packages: z.array(PricingPackageLineSchema).max(10).default([]),
    lineItems: z.array(PricingCustomLineSchema).max(30).default([]),
    discount: PricingDiscountSchema.default({ type: "NONE" }),
    tax: z
      .object({ enabled: z.boolean(), rateBps: z.int().min(0).max(BPS_DENOMINATOR) })
      .default({ enabled: false, rateBps: 0 }),
  })
  .refine((v) => v.packages.length + v.lineItems.length >= 1, {
    message: "A proposal needs at least one package or line item.",
  });
export type PriceProposalInput = z.input<typeof PriceProposalInputSchema>;

export interface PricedLine {
  kind: "PACKAGE" | "CUSTOM";
  packageId: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface PricedProposal {
  currency: Currency;
  lines: PricedLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
}

/** Round `base * bps / 10000` to the nearest minor unit, half away from zero, with integer maths. */
function applyBps(base: number, bps: number): number {
  if (bps === 0 || base === 0) return 0;
  return Math.floor((base * bps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

/**
 * Prices a proposal. Throws `VALIDATION_FAILED` when the currency doesn't suit the market, when a
 * fixed discount exceeds the subtotal, or when the shape is invalid. The result's amounts are the
 * only figures a proposal may show (INV-17).
 */
export function priceProposal(raw: PriceProposalInput): PricedProposal {
  const parsed = PriceProposalInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "The proposal couldn't be priced.", {
      details: { issues: parsed.error.issues },
    });
  }
  const input = parsed.data;

  const allowed: readonly Currency[] = MARKET_CURRENCIES[input.market];
  if (!allowed.includes(input.currency)) {
    throw new AppError(
      "VALIDATION_FAILED",
      `A ${input.market} proposal can't be priced in ${input.currency}.`,
      { details: { market: input.market, currency: input.currency, allowed } },
    );
  }

  const lines: PricedLine[] = [
    ...input.packages.map(
      (p): PricedLine => ({
        kind: "PACKAGE",
        packageId: p.packageId,
        description: p.name,
        quantity: p.quantity,
        unitPriceMinor: p.unitPriceMinor,
        totalMinor: p.quantity * p.unitPriceMinor,
      }),
    ),
    ...input.lineItems.map(
      (l): PricedLine => ({
        kind: "CUSTOM",
        packageId: null,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        totalMinor: l.quantity * l.unitPriceMinor,
      }),
    ),
  ];

  const subtotalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);

  let discountMinor = 0;
  if (input.discount.type === "PERCENT") {
    discountMinor = applyBps(subtotalMinor, input.discount.valueBps);
  } else if (input.discount.type === "AMOUNT") {
    discountMinor = input.discount.valueMinor;
  }
  if (discountMinor > subtotalMinor) {
    throw new AppError("VALIDATION_FAILED", "A discount can't be larger than the subtotal.", {
      details: { subtotalMinor, discountMinor },
    });
  }

  const taxableBase = subtotalMinor - discountMinor;
  const taxRateBps = input.tax.enabled ? input.tax.rateBps : 0;
  const taxMinor = applyBps(taxableBase, taxRateBps);
  const totalMinor = taxableBase + taxMinor;

  return { currency: input.currency, lines, subtotalMinor, discountMinor, taxRateBps, taxMinor, totalMinor };
}

/**
 * The effective discount as basis points of the subtotal, for the approval-threshold check
 * (a fixed-amount discount is expressed as its share of the subtotal). Returns 0 for an empty
 * subtotal.
 */
export function effectiveDiscountBps(priced: PricedProposal): number {
  if (priced.subtotalMinor === 0) return 0;
  return Math.round((priced.discountMinor * BPS_DENOMINATOR) / priced.subtotalMinor);
}
