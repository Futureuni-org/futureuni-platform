import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Timeline — a vertical list of dated entries on a hairline rule (Phase 4 deferred this composite;
 * a Phase 16 candidate for promotion). Used for lead activity and signals.
 */
export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ol className={cn("relative ml-1 flex flex-col gap-6 border-l border-border pl-6", className)}>
      {children}
    </ol>
  );
}

export function TimelineItem({ children }: { children: ReactNode }) {
  return (
    <li className="relative flex flex-col gap-1">
      <span
        aria-hidden
        className="absolute top-1.5 -left-[1.8rem] size-2.5 rounded-full bg-primary ring-4 ring-background"
      />
      {children}
    </li>
  );
}
