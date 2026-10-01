/**
 * Number-consistency check for AI-written proposal prose (INV-17). The model may only restate the
 * figures the deterministic pricing function produced and the dates the service supplied. This
 * deterministic scan parses every currency amount and calendar date out of the prose and compares
 * them against the allowed sets. A mismatch triggers one repair attempt in the service; a second
 * failure raises `AI_OUTPUT_INVALID`.
 *
 * It never does floating-point money maths: amounts are parsed to integer minor units with
 * `toMinor` from `@/lib/money`.
 */

import type { Currency } from "@/contracts/common";
import { toMinor } from "@/lib/money";

const SYMBOL_CURRENCY: Readonly<Record<string, Currency>> = {
  "₦": "NGN",
  $: "USD",
  "£": "GBP",
  "€": "EUR",
};

/** A currency amount with its symbol, an optional compact suffix, and the digits. */
const AMOUNT_RE = /([₦$£€])\s?([0-9][0-9, ]*(?:\.[0-9]+)?)(bn|m|k)?/gi;

/** A calendar date in the document format, e.g. "25 Oct 2026". */
const DATE_RE =
  /\b([0-3]?\d)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/g;

export type NumberMismatchKind = "amount" | "currency" | "compact" | "date";

export interface NumberMismatch {
  kind: NumberMismatchKind;
  token: string;
}

export interface NumberCheckInput {
  /** The prose to scan (sections joined, or one section). */
  text: string;
  /** The proposal's currency; any other currency symbol in the prose is a mismatch. */
  currency: Currency;
  /** Every amount the prose may state, in minor units. */
  allowedAmountsMinor: readonly number[];
  /** Every calendar date the prose may state, formatted like "25 Oct 2026". */
  allowedDates: readonly string[];
}

export interface NumberCheckResult {
  ok: boolean;
  mismatches: NumberMismatch[];
}

/** Formats a date as the document format "25 Oct 2026" (en-GB, no leading zero). */
export function formatDocDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Normalises a parsed date token ("05 Oct 2026") to the canonical "5 Oct 2026". */
function normaliseDate(day: string, month: string, year: string): string {
  return `${String(Number(day))} ${month} ${year}`;
}

export function checkNumbersConsistent(input: NumberCheckInput): NumberCheckResult {
  const mismatches: NumberMismatch[] = [];
  const allowedAmounts = new Set(input.allowedAmountsMinor);
  const allowedDates = new Set(input.allowedDates.map((d) => d.trim()));

  for (const match of input.text.matchAll(AMOUNT_RE)) {
    const [token, symbol = "", digits = "", suffix] = match;
    const currency = SYMBOL_CURRENCY[symbol];
    if (currency === undefined) continue;
    if (currency !== input.currency) {
      mismatches.push({ kind: "currency", token: token.trim() });
      continue;
    }
    if (suffix !== undefined) {
      // Compact forms (₦1.4m) are ambiguous and never used in prose; flag them outright.
      mismatches.push({ kind: "compact", token: token.trim() });
      continue;
    }
    const cleaned = digits.replace(/[^0-9.]/g, "");
    let minor: number;
    try {
      minor = toMinor(cleaned, currency);
    } catch {
      mismatches.push({ kind: "amount", token: token.trim() });
      continue;
    }
    if (!allowedAmounts.has(minor)) {
      mismatches.push({ kind: "amount", token: token.trim() });
    }
  }

  for (const match of input.text.matchAll(DATE_RE)) {
    const [token, day = "", month = "", year = ""] = match;
    if (!allowedDates.has(normaliseDate(day, month, year))) {
      mismatches.push({ kind: "date", token: token.trim() });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
