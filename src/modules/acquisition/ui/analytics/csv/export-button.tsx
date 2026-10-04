"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui";
import { toCsv } from "../csv";

/**
 * Downloads a chart's data as a CSV (Phase 17; every chart has a CSV export). The data is already
 * on the client as props, so the file is built and downloaded in the browser — no round-trip.
 */
export function CsvExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  function download() {
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={download} aria-label={`Export ${filename} as CSV`}>
      <Download aria-hidden className="size-4" />
      CSV
    </Button>
  );
}
