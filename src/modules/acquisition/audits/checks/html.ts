/**
 * Small, dependency-free HTML inspectors used by the deterministic web/UI checks. The project's
 * extractors are regex-based (see `enrichment/extract`), and these follow the same approach: good
 * enough for homepage heuristics, with unit tests over fixtures. They never execute HTML.
 */

import "server-only";

function matchFirst(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m?.[1]?.trim() ?? null;
}

export function extractTitle(html: string): string | null {
  return matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
}

export function extractMetaDescription(html: string): string | null {
  const m =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html);
  return m?.[1]?.trim() ?? null;
}

export function countH1(html: string): number {
  return (html.match(/<h1[\s>]/gi) ?? []).length;
}

export function hasViewportMeta(html: string): boolean {
  return /<meta[^>]+name=["']viewport["']/i.test(html);
}

export function extractOgImage(html: string): string | null {
  const m =
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
  return m?.[1]?.trim() ?? null;
}

export function hasOpenGraph(html: string): boolean {
  return /<meta[^>]+property=["']og:(title|description|image|url)["']/i.test(html);
}

export function extractFavicon(html: string, baseUrl: string): string | null {
  const m = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(html);
  const href = m?.[1]?.trim();
  if (href === undefined) return null;
  return resolveUrl(href, baseUrl);
}

/** Internal (same registrable host) links from the homepage, absolute, de-duplicated. */
export function extractInternalLinks(html: string, baseUrl: string, limit = 20): string[] {
  const base = safeUrl(baseUrl);
  if (base === null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const raw = m[1];
    if (raw === undefined) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    const abs = resolveUrl(raw, baseUrl);
    if (abs === null) continue;
    const u = safeUrl(abs);
    if (u?.host !== base.host) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** The most recent 4-digit copyright year in the page, if any. */
export function extractCopyrightYear(html: string): number | null {
  const years: number[] = [];
  const re = /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const y = Number(m[1]);
    if (Number.isInteger(y) && y >= 1990 && y <= 2100) years.push(y);
  }
  return years.length === 0 ? null : Math.max(...years);
}

/** Forms that post to a plain-HTTP action (credential/data leakage risk). */
export function hasHttpForm(html: string): boolean {
  return /<form[^>]+action=["']http:\/\//i.test(html);
}

/** Rough legacy-tech hints visible in markup. */
export function legacyTechHints(html: string): string[] {
  const hints: string[] = [];
  if (/jquery[-.]?1\.\d/i.test(html)) hints.push("jQuery 1.x");
  if (/<(table)[^>]*>[\s\S]*<(table)[^>]*>/i.test(html) && /<td[^>]*>\s*<img/i.test(html)) {
    hints.push("table-based layout");
  }
  if (/\.swf["']/i.test(html) || /application\/x-shockwave-flash/i.test(html)) hints.push("Flash");
  if (/<font[\s>]/i.test(html)) hints.push("<font> tags");
  if (/<marquee[\s>]/i.test(html)) hints.push("<marquee>");
  return hints;
}

export function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

export function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
