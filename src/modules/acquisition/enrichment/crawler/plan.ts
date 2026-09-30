/**
 * Crawl planner (Phase 9). Given the seed HTML, produce a prioritised list of same-registrable-
 * domain URLs to fetch next, favouring the pages that carry contact and legal information.
 */

import { getDomain } from "tldts";

const PRIORITY_PATTERNS: RegExp[] = [
  /\bcontact\b/i,
  /\babout(?:-us)?\b/i,
  /\bour[-\s]?story\b/i,
  /\bour[-\s]?team\b/i,
  /\bteam\b/i,
  /\bservices?\b/i,
  /\bcareers\b/i,
  /\blegal\b/i,
  /\bprivacy\b/i,
  /\bimprint\b/i,
  /\bfooter\b/i,
];

export interface PlanOptions {
  origin: string;
  seedDomain: string;
  maxPages: number;
}

/** Collect internal same-registrable-domain links from `html`, prioritised, deduplicated. */
export function planCrawl(html: string, opts: PlanOptions): string[] {
  const seen = new Set<string>();
  const found: { url: string; priority: number }[] = [];
  const hrefRe = /<a[^>]+href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1];
    if (href === undefined) continue;
    let parsed: URL;
    try {
      parsed = new URL(href, opts.origin);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const domain = getDomain(parsed.hostname) ?? parsed.hostname;
    if (domain.toLowerCase() !== opts.seedDomain.toLowerCase()) continue;
    parsed.hash = "";
    const canonical = parsed.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const priority = scorePath(parsed.pathname);
    found.push({ url: canonical, priority });
  }
  found.sort((a, b) => b.priority - a.priority);
  return found.slice(0, Math.max(0, opts.maxPages)).map((f) => f.url);
}

function scorePath(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  for (const pattern of PRIORITY_PATTERNS) if (pattern.test(lower)) score += 1;
  if (lower === "/" || lower === "") score += 0; // homepage handled as seed
  if (lower.split("/").length <= 3) score += 1; // shorter paths are usually navigation
  return score;
}
