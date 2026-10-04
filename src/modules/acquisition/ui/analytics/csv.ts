/**
 * CSV building for chart exports (Phase 17; project-rules §Output: UTF-8 with a BOM and a header
 * row). The escaping mirrors the platform audit-log exporter. A candidate to promote into a shared
 * `src/lib` util at integration (listed in REQUESTS.md).
 */

/** Quotes a cell when it contains a comma, quote or newline, doubling embedded quotes. */
export function csvCell(value: string): string {
  if (value === "") return "";
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds a CSV document (BOM, CRLF line endings, header row) from headers and rows. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const head = headers.map((h) => csvCell(h)).join(",");
  const body = rows.map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\r\n");
  const bom = String.fromCharCode(0xfeff);
  return `${bom}${head}\r\n${body}${body === "" ? "" : "\r\n"}`;
}
