import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * PageHeader — Editorial Ledger cover for every screen.
 *
 *   eyebrow · title (display) · description
 *                          · primary + secondary actions on the right
 *   breadcrumbs slot (optional, above eyebrow)
 *   tabs slot (optional, below description)
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
  tabs,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-6", className)}>
      {breadcrumbs !== undefined && <div>{breadcrumbs}</div>}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          {eyebrow !== undefined && (
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em]">
            {title}
          </h1>
          {description !== undefined && (
            <p className="max-w-prose text-lg text-muted">{description}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        )}
      </div>
      {tabs !== undefined && <div>{tabs}</div>}
    </header>
  );
}
