import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface AdminColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Extra classes for the cell (e.g. "font-mono tabular-nums"). */
  className?: string;
  /** Hide this column's header visually on desktop (value still labelled on mobile cards). */
  cell: (row: T) => ReactNode;
}

/**
 * AdminTable — a responsive data table. A real `<table>` at `md` and up; below `md` each row
 * becomes a stacked label/value card (B3.4, no horizontal overflow at 375px). Presentational:
 * pass already-fetched, permission-filtered rows. Supply `empty` for the zero state.
 */
export function AdminTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  empty,
  className,
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  return (
    <div className={className}>
      {/* Desktop table */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "py-2 pr-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted",
                  col.align === "right" && "text-right",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="border-b border-border/60 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "py-3 pr-4 align-middle text-foreground",
                    col.align === "right" && "text-right",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)} className="flex flex-col gap-2 rounded-lg bg-zone px-4 py-3">
            {columns.map((col) => (
              <div key={col.key} className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  {col.header}
                </span>
                <span className={cn("text-right text-sm text-foreground", col.className)}>
                  {col.cell(row)}
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
