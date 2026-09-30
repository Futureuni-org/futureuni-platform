/**
 * Extract social handles from HTML. LinkedIn kept as company-page URL only (§3 rule 10).
 */

import type { z } from "zod";

import type { CompanySocialsSchema } from "@/contracts/enrichment";

export type CompanySocials = z.infer<typeof CompanySocialsSchema>;

const HREF_RE = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;

const RULES: { key: keyof CompanySocials; test: (url: URL) => boolean }[] = [
  { key: "instagram", test: (u) => /(^|\.)instagram\.com$/i.test(u.host) },
  { key: "facebook", test: (u) => /(^|\.)facebook\.com$/i.test(u.host) },
  { key: "linkedin", test: (u) => /(^|\.)linkedin\.com$/i.test(u.host) && /^\/company\//i.test(u.pathname) },
  { key: "x", test: (u) => /(^|\.)(twitter|x)\.com$/i.test(u.host) },
  { key: "tiktok", test: (u) => /(^|\.)tiktok\.com$/i.test(u.host) },
  { key: "youtube", test: (u) => /(^|\.)(youtube\.com|youtu\.be)$/i.test(u.host) },
  { key: "behance", test: (u) => /(^|\.)behance\.net$/i.test(u.host) },
  { key: "dribbble", test: (u) => /(^|\.)dribbble\.com$/i.test(u.host) },
  { key: "whatsapp", test: (u) => /(^|\.)(wa\.me|api\.whatsapp\.com)$/i.test(u.host) },
];

export function extractSocials(html: string): CompanySocials {
  const out: CompanySocials = {};
  let match: RegExpExecArray | null;
  while ((match = HREF_RE.exec(html)) !== null) {
    const href = match[1];
    if (href === undefined) continue;
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    for (const rule of RULES) {
      if (rule.test(parsed) && out[rule.key] === undefined) {
        out[rule.key] = parsed.toString();
      }
    }
  }
  return out;
}
