/**
 * A small RFC 4180 CSV parser (no dependency): handles quoted fields, escaped quotes (""),
 * embedded commas and newlines, and both CRLF and LF line endings. Returns rows of string cells.
 * Used by the CSV import adapter; kept pure and separately tested.
 */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // whether the current row has any content yet

  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // strip BOM
  let i = 0;
  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
    started = false;
  };

  while (i < text.length) {
    const char = text.charAt(i);
    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      started = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      started = true;
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (text.charAt(i + 1) === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    started = true;
    i += 1;
  }
  // Flush the last field/row unless the file ended on a clean newline with nothing buffered.
  if (started || field !== "" || row.length > 0) pushRow();
  return rows;
}

/** Serialises rows back to CSV (UTF-8, with quoting where needed), for the error report. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const quote = (cell: string): string =>
    /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return rows.map((r) => r.map(quote).join(",")).join("\r\n");
}
