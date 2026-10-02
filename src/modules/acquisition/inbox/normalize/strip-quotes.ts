/**
 * Strips quoted history and signatures from a plain-text reply, leaving the latest message only.
 * Handles Gmail/Apple attribution lines ("On ... wrote:"), Outlook reply headers
 * ("-----Original Message-----" and From/Sent/To blocks), ">"-quoted bodies, the standard "-- "
 * signature delimiter and common mobile footers. It is deliberately conservative: it never returns
 * empty text, so a reply that is only a signature or quote falls back to the trimmed original.
 */

const ATTRIBUTION_SAME_LINE = /^\s*On\b.*\bwrote:\s*$/;
const ATTRIBUTION_START = /^\s*On\b/;
const ORIGINAL_MESSAGE = /^\s*-{2,}\s*(original message|forwarded message)\s*-{2,}\s*$/i;
const REPLY_HEADER_FROM = /^\s*(From|De|Von)\s*:\s*\S/;
const REPLY_HEADER_FIELD = /^\s*(Sent|Date|To|Subject|Cc|Envoyé|Gesendet)\s*:/i;
const HORIZONTAL_RULE = /^\s*[_-]{10,}\s*$/;
const QUOTE_LINE = /^\s*>/;
const SIGNATURE_DELIM = /^--\s?$/;
const MOBILE_FOOTER =
  /^\s*(sent from my |sent from my i|get outlook for |sent via |enviado desde mi |von meinem iphone)/i;

/** Returns the 0-based line index at which quoted history begins, or -1 if none found. */
function findQuoteStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (ATTRIBUTION_SAME_LINE.test(line)) return i;
    if (ORIGINAL_MESSAGE.test(line)) return i;
    if (QUOTE_LINE.test(line)) return i;
    // Two- or three-line Gmail attribution ("On <date>, <name> <\n email> wrote:").
    if (ATTRIBUTION_START.test(line)) {
      const joined = lines.slice(i, i + 3).join(" ");
      if (/\bwrote:\s*$/.test(joined) || /\bwrote:\s/.test(joined)) return i;
    }
    // Outlook reply header: a "From:" line followed shortly by Sent/Date/To/Subject.
    if (REPLY_HEADER_FROM.test(line)) {
      const lookahead = lines.slice(i + 1, i + 5);
      if (lookahead.some((l) => REPLY_HEADER_FIELD.test(l))) return i;
    }
    // A horizontal rule immediately before a reply header.
    if (HORIZONTAL_RULE.test(line) && REPLY_HEADER_FROM.test(lines[i + 1] ?? "")) {
      return i;
    }
  }
  return -1;
}

/** Returns the 0-based line index at which the signature begins, or -1 if none found. */
function findSignatureStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (SIGNATURE_DELIM.test(line)) return i;
    if (MOBILE_FOOTER.test(line)) return i;
  }
  return -1;
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim() === "") start++;
  while (end > start && (lines[end - 1] ?? "").trim() === "") end--;
  return lines.slice(start, end);
}

export function stripQuotesAndSignature(input: string): string {
  const normalised = input.replace(/\r\n?/g, "\n");
  const lines = normalised.split("\n");

  const cuts = [findQuoteStart(lines), findSignatureStart(lines)].filter((n) => n >= 0);
  const cutAt = cuts.length > 0 ? Math.min(...cuts) : lines.length;

  const kept = trimBlankEdges(lines.slice(0, cutAt));
  const latest = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (latest !== "") return latest;
  // The whole message was a quote or signature: keep the trimmed original so nothing is lost.
  return normalised.replace(/\n{3,}/g, "\n\n").trim();
}
