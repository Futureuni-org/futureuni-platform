/**
 * Extract legal-form hints from HTML: UK suffixes and company numbers, Nigerian RC/BN numbers,
 * and "sole trader" wording (`docs/contracts/enrichment.md` §3 rule 14).
 */

import type { z } from "zod";

import type { LegalFormHintSchema } from "@/contracts/enrichment";

export type LegalFormHint = z.infer<typeof LegalFormHintSchema>;

const SUFFIX_RE = /\b(Ltd\.?|Limited|LLP|PLC|GmbH|LLC|S\.A\.?|B\.V\.?|Pty Ltd|Inc\.?)\b/g;
const UK_NUMBER_RE = /\b(?:Company (?:No|Number|Reg(?:istration)? (?:No|Number))\.?\s*[:#]?\s*)?((?:SC|NI|OC|SO|SL|R|FC|GN|GS|GE|NF|NP|NC|IP|IC|SP|NR|NL|ZC|CE|CS|CI|CU|NE|NA|NZ|LP|SL)?\d{6,8})\b/g;
const NG_RC_RE = /\bRC(?:\s*[:#-]?\s*)(\d{4,10})\b/gi;
const NG_BN_RE = /\bBN(?:\s*[:#-]?\s*)(\d{4,10})\b/gi;
const SOLE_TRADER_RE = /\b(?:sole trader|sole proprietor|self[-\s]?employed)\b/gi;

interface Ctx {
  html: string;
  pageUrl?: string;
}

export function extractLegalFormHints(ctx: Ctx): LegalFormHint[] {
  const text = ctx.html.replace(/<[^>]+>/g, " ");
  const hints: LegalFormHint[] = [];
  const push = (kind: LegalFormHint["kind"], value: string): void => {
    hints.push({ kind, value: value.slice(0, 40), ...(ctx.pageUrl === undefined ? {} : { pageUrl: ctx.pageUrl }) });
  };

  for (const match of text.matchAll(new RegExp(SUFFIX_RE.source, "g"))) if (match[1] !== undefined) push("suffix", match[1]);
  for (const match of text.matchAll(new RegExp(UK_NUMBER_RE.source, "g"))) {
    if (match[1] !== undefined && /^\d{8}$/.test(match[1])) push("uk-company-number", match[1]);
  }
  for (const match of text.matchAll(new RegExp(NG_RC_RE.source, "gi"))) if (match[1] !== undefined) push("ng-rc", `RC${match[1]}`);
  for (const match of text.matchAll(new RegExp(NG_BN_RE.source, "gi"))) if (match[1] !== undefined) push("ng-bn", `BN${match[1]}`);
  for (const match of text.matchAll(new RegExp(SOLE_TRADER_RE.source, "gi"))) push("sole-trader-wording", match[0]);

  // Deduplicate by (kind, value).
  const seen = new Set<string>();
  return hints.filter((h) => {
    const key = `${h.kind}:${h.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
