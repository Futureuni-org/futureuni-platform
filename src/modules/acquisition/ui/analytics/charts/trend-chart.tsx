"use client";

import { useState } from "react";

import { LineChart, type LineDatum } from "@/components/charts";
import { cn } from "@/lib/cn";

export interface TrendSeriesOption {
  key: string;
  label: string;
}

/**
 * Time-series trends with a metric switcher (Phase 17): leads found, sent, replies and meetings
 * over time. Toggling a series shows or hides it; at least one stays on. Uses Phase 4's LineChart.
 */
export function TrendChart({
  points,
  series,
}: {
  points: { bucket: string; values: Record<string, number> }[];
  series: TrendSeriesOption[];
}) {
  const [active, setActive] = useState<Set<string>>(new Set(series.map((s) => s.key)));

  function toggle(key: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const shown = series.filter((s) => active.has(s.key));
  const data: LineDatum[] = points.map((p) => {
    const row: LineDatum = { x: p.bucket };
    for (const s of shown) row[s.key] = p.values[s.key] ?? 0;
    return row;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Metrics shown">
        {series.map((s) => {
          const on = active.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => { toggle(s.key); }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary-soft text-primary-soft-foreground"
                  : "border-input text-muted hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <LineChart
        title="Trends over time"
        summary="Leads found, sent, replies and meetings over the selected range."
        data={data}
        series={shown}
      />
    </div>
  );
}
