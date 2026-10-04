import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * DetailLayout — a record's main column plus a side rail (Phase 4 deferred this composite, so it
 * lives here as a Phase 16 candidate for promotion). On small screens the main column comes first
 * and the rail follows it, in the same order as the markup, so the tab someone opened is what they
 * see and what a screen reader reaches first. From `lg` the rail sits beside the main column. It is
 * not sticky: the rail is often taller than the viewport, and a sticky one could never be scrolled
 * to its end.
 */
export function DetailLayout({
  main,
  rail,
  className,
}: {
  main: ReactNode;
  rail: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]", className)}>
      <div className="min-w-0">{main}</div>
      <aside aria-label="Lead details" className="flex h-fit min-w-0 flex-col gap-6">
        {rail}
      </aside>
    </div>
  );
}
