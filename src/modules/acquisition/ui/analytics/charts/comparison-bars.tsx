"use client";

import { ChartFrame } from "@/components/charts";
import { serviceLineAccent } from "@/lib/chart-theme";
import { useTheme } from "@/lib/theme";
import type { ServiceLine } from "@/contracts/common";

/**
 * Cross-line comparison bars for one metric (Phase 17 overview), each bar in its service line's
 * accent colour from the chart tokens. Values are already formatted for display by the caller.
 */
export interface ComparisonRow {
  serviceLine: ServiceLine;
  label: string;
  /** Numeric value used for bar width (nulls render as an empty bar). */
  value: number | null;
  /** The display string shown at the end of the bar. */
  display: string;
}

export function ComparisonBars({ title, summary, rows }: { title: string; summary: string; rows: ComparisonRow[] }) {
  const { theme } = useTheme();
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0)) || 1;
  return (
    <ChartFrame
      title={title}
      summary={summary}
      columns={["Line", "Value"]}
      rows={rows.map((r) => [r.label, r.display])}
      height={Math.max(120, rows.length * 40)}
      empty={rows.every((r) => (r.value ?? 0) === 0)}
    >
      <ul className="flex h-full flex-col justify-center gap-2">
        {rows.map((r) => (
          <li key={r.serviceLine} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-foreground">{r.label}</span>
            <div className="relative h-4 flex-1 rounded-sm bg-zone">
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${String(Math.max(2, Math.round(((r.value ?? 0) / max) * 100)))}%`,
                  backgroundColor: serviceLineAccent(theme, r.serviceLine),
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
              {r.display}
            </span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
