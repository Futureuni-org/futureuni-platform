/**
 * Extract emails from HTML (Phase 9, `docs/contracts/enrichment.md` §3 rule 8).
 *
 * Sources: `mailto:` links, visible text, common obfuscations (`name [at] domain [dot] com`,
 * HTML entities like `&#64;`, images are ignored), and schema.org `email`. Placeholders and
 * system addresses are filtered out. Each email is classified `PERSONAL` (a person's name) or
 * `ROLE` (info@, hello@, sales@).
 */

import type { z } from "zod";

import type { ExtractedEmailSchema } from "@/contracts/enrichment";

export type ExtractedEmail = z.infer<typeof ExtractedEmailSchema>;

const EMAIL_RE = /([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi;

const OBFUSCATION_RE = /([a-z0-9._%+-]+)\s*(?:\[|\(|&#40;)\s*at\s*(?:\]|\)|&#41;)\s*([a-z0-9.-]+)\s*(?:\[|\(|&#40;)\s*dot\s*(?:\]|\)|&#41;)\s*([a-z]{2,})/gi;

const ROLE_LOCAL_PARTS: readonly RegExp[] = [
  /^info$/,
  /^hello$/,
  /^hi$/,
  /^contact$/,
  /^sales$/,
  /^support$/,
  /^help$/,
  /^admin$/,
  /^office$/,
  /^enquiries$/,
  /^inquiries$/,
  /^team$/,
  /^careers$/,
  /^jobs$/,
  /^hr$/,
  /^accounts$/,
  /^billing$/,
  /^marketing$/,
  /^press$/,
  /^media$/,
  /^partners$/,
  /^legal$/,
  /^privacy$/,
  /^dpo$/,
  /^no-?reply$/,
  /^service$/,
  /^customercare$/,
];

const PLACEHOLDER_LOCALS: readonly string[] = ["example", "you", "yourname", "test", "username", "user"];

/** System addresses used by common builders that should never be treated as a business contact. */
const SYSTEM_DOMAINS: readonly RegExp[] = [
  /^sentry\.io$/i,
  /wixpress\.com$/i,
  /^example\.(?:com|org|net)$/i,
  /^domain\.(?:com|org|net|tld)$/i,
];

export function classifyLocalPart(local: string): "PERSONAL" | "ROLE" {
  const lower = local.toLowerCase();
  return ROLE_LOCAL_PARTS.some((r) => r.test(lower)) ? "ROLE" : "PERSONAL";
}

export function isPlaceholder(local: string, domain: string): boolean {
  if (PLACEHOLDER_LOCALS.includes(local.toLowerCase())) return true;
  if (SYSTEM_DOMAINS.some((r) => r.test(domain))) return true;
  return false;
}

interface ExtractContext {
  html: string;
  pageUrl?: string;
}

/** Decode a limited set of HTML numeric entities used in obfuscation ('&#64;' → '@'). */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex: string | undefined, dec: string | undefined) => {
      const code = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec ?? "0", 10);
      if (!Number.isFinite(code)) return "";
      return String.fromCodePoint(code);
    })
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

/** Extract all emails found in the HTML, deduplicated (case-insensitive on local part is not applied). */
export function extractEmails(ctx: ExtractContext): ExtractedEmail[] {
  const html = decodeEntities(ctx.html);
  const seen = new Set<string>();
  const results: ExtractedEmail[] = [];

  const push = (email: string, source: ExtractedEmail["source"], personName?: string): void => {
    const [local, ...rest] = email.split("@");
    const domain = rest.join("@");
    if (local === undefined || domain === "") return;
    if (isPlaceholder(local, domain)) return;
    const canonical = `${local.toLowerCase()}@${domain.toLowerCase()}`;
    if (seen.has(canonical)) return;
    seen.add(canonical);
    results.push({
      email: canonical,
      kind: classifyLocalPart(local),
      source,
      ...(ctx.pageUrl === undefined ? {} : { pageUrl: ctx.pageUrl }),
      ...(personName === undefined ? {} : { personName }),
    });
  };

  // mailto: links.
  for (const mm of html.matchAll(/<a[^>]+href\s*=\s*["']?mailto:([^"'\s?]+)/gi)) {
    if (mm[1] !== undefined) push(mm[1], "mailto");
  }

  // Obfuscated forms.
  for (const om of html.matchAll(new RegExp(OBFUSCATION_RE.source, "gi"))) {
    if (om[1] !== undefined && om[2] !== undefined && om[3] !== undefined) {
      push(`${om[1]}@${om[2]}.${om[3]}`, "obfuscated");
    }
  }

  // schema.org "email": "…"
  for (const sm of html.matchAll(/"email"\s*:\s*"([^"]+)"/gi)) {
    if (sm[1] !== undefined) push(sm[1], "schema-org");
  }

  // Plain visible-text emails.
  for (const em of html.matchAll(new RegExp(EMAIL_RE.source, "gi"))) {
    push(em[0], "text");
  }

  return results;
}
