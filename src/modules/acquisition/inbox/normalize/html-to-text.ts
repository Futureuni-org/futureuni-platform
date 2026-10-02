/**
 * Minimal, dependency-free HTML-to-text conversion for inbound email bodies. It never executes or
 * renders HTML (INV-24): tags are stripped, scripts and styles dropped, block elements become line
 * breaks and entities are decoded. Anchor hrefs are preserved in parentheses so links (for example
 * an unsubscribe or booking link) survive into the text we classify.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function safeFromCodePoint(code: number): string {
  if (code <= 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Converts an HTML email body to plain text. Returns a trimmed, newline-separated string. */
export function htmlToText(html: string): string {
  let text = html;
  // Drop script/style/head content entirely.
  text = text.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Comments.
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  // Preserve anchor targets: "<a href="url">label</a>" -> "label (url)".
  text = text.replace(
    /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, _q: string, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, "").trim();
      const cleanHref = href.trim();
      if (cleanHref === "" || cleanHref.startsWith("mailto:") || cleanLabel === cleanHref) return cleanLabel;
      return `${cleanLabel} (${cleanHref})`;
    },
  );
  // Line breaks for block-level boundaries.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table|ul|ol)>/gi, "\n");
  text = text.replace(/<li\b[^>]*>/gi, "- ");
  // Strip every remaining tag.
  text = text.replace(/<[^>]+>/g, "");
  // Decode entities, normalise whitespace.
  text = decodeEntities(text);
  text = text.replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trimEnd())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
