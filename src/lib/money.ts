/**
 * Money helpers (docs/contracts/common.md: FormatMoney, ToMinor, FromMinor; INV-11).
 *
 * Amounts are integer minor units plus a currency. Nothing here does floating-point arithmetic on
 * money: amounts are split into whole and minor parts with integer maths, and Intl formats the
 * resulting exact decimal string (Intl formats string input without a float step). The symbol is
 * added from CURRENCY_SYMBOL, because Intl's currency style prints "US$" for USD in en-GB.
 * Locale: en-NG for NGN, en-GB for everything else (project-rules §"Output/document rules").
 */

import {
  CURRENCY_EXPONENT,
  CURRENCY_SYMBOL,
  type Currency,
  type FormatMoney,
  type FromMinor,
  type ToMinor,
} from "@/contracts/common";
import { AppError } from "@/lib/errors";

const localeFor = (currency: Currency) => (currency === "NGN" ? "en-NG" : "en-GB");

function assertMinorUnits(minor: number): void {
  if (!Number.isSafeInteger(minor)) {
    throw new AppError("VALIDATION_FAILED", "Money must be a whole number of minor units.");
  }
}

/** Splits minor units into the whole part and the minor digits, e.g. 125050 → [1250, "50"]. */
function split(minor: number, currency: Currency): { whole: number; fraction: string } {
  const exponent = CURRENCY_EXPONENT[currency];
  const unit = 10 ** exponent;
  const absolute = Math.abs(minor);
  const whole = Math.trunc(absolute / unit);
  const fraction = String(absolute - whole * unit).padStart(exponent, "0");
  return { whole, fraction };
}

/** An exact decimal ("1250.50") for Intl, built from integers only. */
function decimal(whole: number, fraction: string): `${number}` {
  return (fraction === "" ? String(whole) : `${String(whole)}.${fraction}`) as `${number}`;
}

const COMPACT_STEPS = [
  { size: 1_000, suffix: "k" },
  { size: 1_000_000, suffix: "m" },
  { size: 1_000_000_000, suffix: "bn" },
] as const;

/**
 * "4.2m" for 4,200,000: one decimal, dropped when it's zero. Used in charts and stat rows only.
 * An amount that rounds up to 1,000 of a unit moves to the next one ("1m", not "1,000k").
 */
function compactWhole(whole: number, locale: string): string | null {
  const index = COMPACT_STEPS.findLastIndex(({ size }) => whole >= size);
  let step = COMPACT_STEPS[index];
  if (step === undefined) return null;
  let tenths = Math.round((whole * 10) / step.size);
  const next = COMPACT_STEPS[index + 1];
  if (tenths >= 10_000 && next !== undefined) {
    step = next;
    tenths = Math.round((whole * 10) / next.size);
  }
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    decimal(Math.trunc(tenths / 10), String(tenths % 10)),
  );
  return `${formatted}${step.suffix}`;
}

/**
 * Formats an amount with its symbol.
 * - UI (`showMinor: "auto"`, the default): whole amounts show no minor units, part amounts show
 *   two decimals: ₦250,000 · £1,250.50 · $1,200.
 * - Documents (`showMinor: "always"`): USD, GBP and EUR always show two decimals ($4,800.00);
 *   NGN shows whole naira unless there are kobo (₦1,250,000).
 * - `compact: true` (charts, board totals, stat rows): ₦4.2m · $6.8k · £2.1k.
 */
export const formatMoney: FormatMoney = (money, opts = {}) => {
  assertMinorUnits(money.amountMinor);
  const { currency } = money;
  const locale = localeFor(currency);
  const sign = money.amountMinor < 0 ? "-" : "";
  const symbol = CURRENCY_SYMBOL[currency];
  const { whole, fraction } = split(money.amountMinor, currency);

  if (opts.compact === true) {
    const compact = compactWhole(whole, locale);
    if (compact !== null) return `${sign}${symbol}${compact}`;
  }

  const hasMinor = /[1-9]/.test(fraction);
  const alwaysMinor = opts.showMinor === "always" && currency !== "NGN";
  const digits = hasMinor || alwaysMinor ? fraction.length : 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(decimal(whole, digits === 0 ? "" : fraction));
  return `${sign}${symbol}${formatted}`;
};

/** Digits with optional thousands groups (commas or spaces, groups of three) and decimals. */
const PLAIN_AMOUNT = /^\d+(?:\.\d+)?$/;
const GROUPED_AMOUNT = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$|^\d{1,3}(?: \d{3})+(?:\.\d+)?$/;

/**
 * Parses a human decimal string ("1,250.50", "4 800.00", "250000") to minor units. Thousands
 * separators must be real groups of three: a decimal comma ("4,50") or a stray separator ("1 2")
 * is refused rather than guessed. Throws VALIDATION_FAILED for anything else, including more
 * decimals than the currency allows or a negative amount. Never uses floating-point arithmetic.
 */
export const toMinor: ToMinor = (major, currency) => {
  const exponent = CURRENCY_EXPONENT[currency];
  const trimmed = major.trim();
  if (!PLAIN_AMOUNT.test(trimmed) && !GROUPED_AMOUNT.test(trimmed)) {
    throw new AppError("VALIDATION_FAILED", "Enter an amount such as 1,250.50.");
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed.replace(/[ ,]/g, ""));
  if (match === null) {
    throw new AppError("VALIDATION_FAILED", "Enter an amount such as 1,250.50.");
  }
  const [, wholeDigits = "0", fractionDigits = ""] = match;
  if (fractionDigits.length > exponent) {
    throw new AppError(
      "VALIDATION_FAILED",
      `${currency} amounts have at most ${String(exponent)} decimal places.`,
    );
  }
  const minor = Number(wholeDigits + fractionDigits.padEnd(exponent, "0"));
  assertMinorUnits(minor);
  return minor;
};

/** Minor units to a plain decimal string ("1250.50"): no symbol, no grouping, never a float. */
export const fromMinor: FromMinor = (minor, currency) => {
  assertMinorUnits(minor);
  const { whole, fraction } = split(minor, currency);
  const sign = minor < 0 ? "-" : "";
  const exponent: number = CURRENCY_EXPONENT[currency];
  return exponent === 0 ? `${sign}${String(whole)}` : `${sign}${String(whole)}.${fraction}`;
};
