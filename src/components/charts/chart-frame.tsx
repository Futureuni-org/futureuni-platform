"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A common wrapper for every chart. Provides:
 *   - the accessible summary read by screen readers before the chart
 *   - a <details> data-table fallback (patterns.md §Charts)
 *   - height clamp so charts don't inflate layout when data is empty
 *   - loading and empty states
 */

export interface ChartFrameProps {
  title: string;
  /** One-sentence summary of what the chart shows (spoken by screen readers). */
  summary: string;
  /** Table headers for the data-table fallback. */
  columns: readonly string[];
  /** Table rows for the data-table fallback. */
  rows: readonly (readonly (string | number)[])[];
  /** Height in pixels. */
  height?: number;
  loading?: boolean;
  empty?: boolean;
  className?: string | undefined;
  children: ReactNode;
}

export function ChartFrame({
  title,
  summary,
  columns,
  rows,
  height = 240,
  loading,
  empty,
  className,
  children,
}: ChartFrameProps) {
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">
        {title}. {summary}
      </span>
      <div
        role="img"
        aria-label={`${title}. ${summary}`}
        style={{ height }}
        className={cn("relative w-full", loading === true && "animate-pulse")}
      >
        {empty === true ? (
          <p className="flex h-full items-center justify-center text-sm text-muted">
            No data for the selected range.
          </p>
        ) : (
          children
        )}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Show data table</summary>
        <table className="mt-2 w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="text-left">
              {columns.map((column) => (
                <th
                  key={column}
                  className="border-b border-border pb-1 pr-4 font-semibold text-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                {row.map((cell, j) => (
                  <td key={j} className="py-1 pr-4 tabular-nums">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
