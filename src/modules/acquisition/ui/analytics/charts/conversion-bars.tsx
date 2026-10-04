"use client";

import Link from "next/link";

import { ChartFrame } from "@/components/charts";
import { cn } from "@/lib/cn";

import { formatCount, formatPercent } from "../format";
import type { BreakdownResult, BreakdownRow } from "@/modules/acquisition/analytics";

/**
 * Sorted horizontal conversion bars for a breakdown (Phase 17 "what converts"). Each row shows the
 * rate, a bar and the sample size; low-sample rows are visually muted with a "low sample" note. A
 * row links to the filtered leads list when `hrefFor` returns a path (M17-AC5).
 */
export function ConversionBars({
  data,
  hrefFor,
}: {
  data: BreakdownResult;
  hrefFor?: (row: BreakdownRow) => string | null;
}) {
  const max = Math.max(0, ...data.rows.map((r) => r.rate ?? 0)) || 1;
  const columns = ["Group", "Reply rate", "Replies", "Sample"];
  const rows = data.rows.map((r) => [
    r.label,
    r.rate === null ? "—" : formatPercent(r.rate),
    r.numerator,
    r.sampleSize,
  ]);

  return (
    <ChartFrame
      title={`Conversion by ${data.dimension}`}
      summary={`Reply rate for each ${data.dimension}, with sample sizes; small samples are muted.`}
      columns={columns}
      rows={rows}
      height={Math.max(120, data.rows.length * 40)}
      empty={data.rows.length === 0}
    >
      <ul className="flex h-full flex-col gap-2 overflow-y-auto">
        {data.rows.map((row) => {
          const href = hrefFor?.(row) ?? null;
          const widthPct = Math.max(2, Math.round(((row.rate ?? 0) / max) * 100));
          const body = (
            <div className={cn("flex items-center gap-3", row.lowSample && "opacity-55")}>
              <span className="w-28 shrink-0 truncate text-xs text-foreground" title={row.label}>
                {row.label}
              </span>
              <div className="relative h-4 flex-1 rounded-sm bg-zone">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{ width: `${String(widthPct)}%`, backgroundColor: "var(--primary)" }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                {row.rate === null ? "—" : formatPercent(row.rate)}
              </span>
              <span className="w-20 shrink-0 text-right text-xs text-muted">
                n={formatCount(row.sampleSize)}
                {row.lowSample && <span className="ml-1 text-subtle">· low</span>}
              </span>
            </div>
          );
          return (
            <li key={row.key}>
              {href === null ? (
                body
              ) : (
                <Link
                  href={href}
                  className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
