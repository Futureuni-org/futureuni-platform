/**
 * Phone extractor (Phase 9, §3 rule 9). Uses the platform directory's phone normaliser and
 * classifies WhatsApp status from the page content.
 */

import type { z } from "zod";

import type { ExtractedPhoneSchema } from "@/contracts/enrichment";
import { normalizePhone } from "@/platform/directory";

export type ExtractedPhone = z.infer<typeof ExtractedPhoneSchema>;

const TEL_RE = /<a[^>]+href\s*=\s*["']?tel:([^"'\s?>]+)/gi;
const SCHEMA_RE = /"telephone"\s*:\s*"([^"]+)"/gi;
// Visible text: allow international, digits, hyphens, spaces, brackets. Minimum 8 digits.
const TEXT_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
const WA_LINK_RE = /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/(?:send\?phone=)?([+\d]+)/gi;

interface Ctx {
  html: string;
  defaultCountry?: string | null;
  pageUrl?: string;
}

/**
 * Extract phones with sources. WhatsApp is CONFIRMED only when a wa.me / api.whatsapp.com link
 * references the number; a Nigerian mobile is LIKELY per country rule; otherwise UNKNOWN.
 */
export function extractPhones(ctx: Ctx): ExtractedPhone[] {
  const seen = new Map<string, ExtractedPhone>();

  const walinks = new Set<string>();
  for (const wm of ctx.html.matchAll(new RegExp(WA_LINK_RE.source, "gi"))) {
    if (wm[1] === undefined) continue;
    const e164 = normalizePhone(wm[1], ctx.defaultCountry ?? undefined);
    if (e164 !== null) walinks.add(e164);
  }

  const push = (raw: string, source: ExtractedPhone["source"]): void => {
    const e164 = normalizePhone(raw, ctx.defaultCountry ?? undefined);
    if (e164 === null) return;
    if (seen.has(e164)) return;
    seen.set(e164, {
      e164,
      source,
      ...(ctx.pageUrl === undefined ? {} : { pageUrl: ctx.pageUrl }),
      whatsapp: classifyWhatsApp(e164, walinks),
    });
  };

  for (const tm of ctx.html.matchAll(new RegExp(TEL_RE.source, "gi"))) if (tm[1] !== undefined) push(tm[1], "tel");
  for (const sm of ctx.html.matchAll(new RegExp(SCHEMA_RE.source, "gi"))) if (sm[1] !== undefined) push(sm[1], "schema-org");

  // Visible text (from a text-only view of the HTML, so scripts and style don't count).
  const text = ctx.html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  for (const em of text.matchAll(new RegExp(TEXT_RE.source, "g"))) if (em[1] !== undefined) push(em[1], "text");

  return [...seen.values()];
}

function classifyWhatsApp(e164: string, waLinks: Set<string>): ExtractedPhone["whatsapp"] {
  if (waLinks.has(e164)) return "CONFIRMED";
  if (isNigerianMobile(e164)) return "LIKELY";
  return "UNKNOWN";
}

function isNigerianMobile(e164: string): boolean {
  if (!e164.startsWith("+234")) return false;
  const rest = e164.slice(4);
  return /^(70|80|81|90|91)\d{8}$/.test(rest);
}
