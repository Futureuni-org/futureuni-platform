import "server-only";

/**
 * INV-24: untrusted content reaches a model only inside a delimited data block of the form
 *   <untrusted_data source="<kind>" id="<ref>">…</untrusted_data>
 * The delimiter must be escaped wherever it appears in the content, so a payload cannot
 * close the block early.
 */

const OPEN_RE = /<untrusted_data\b/gi;
const CLOSE_RE = /<\/untrusted_data\s*>/gi;

/**
 * Wraps a piece of untrusted content in a data block. `kind` and `id` are HTML-attribute
 * safe (lower-case ASCII plus digits, hyphens and underscores). The content is left literal
 * except for the delimiter tokens, which are neutralised.
 */
export function wrapUntrusted(args: { kind: string; id: string; text: string }): string {
  const kind = sanitizeAttr(args.kind);
  const id = sanitizeAttr(args.id);
  const escaped = args.text
    .replace(OPEN_RE, "<untrusted_data_ESCAPED")
    .replace(CLOSE_RE, "</untrusted_data_ESCAPED>");
  return `<untrusted_data source="${kind}" id="${id}">\n${escaped}\n</untrusted_data>`;
}

function sanitizeAttr(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64);
}
