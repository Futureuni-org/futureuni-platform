import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * SettingsSection — a titled group of settings or admin fields. Spacing-based, no box
 * (Editorial Ledger). The eyebrow hangs a reading-rule when `emphasized`.
 */
export function SettingsSection({
  eyebrow,
  title,
  description,
  actions,
  emphasized,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  emphasized?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          {eyebrow !== undefined && (
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-[0.08em] text-muted",
                emphasized === true && "reading-rule pl-4 text-primary-soft-foreground",
              )}
            >
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-xl font-semibold text-heading">{title}</h2>
          {description !== undefined && <p className="max-w-prose text-sm text-muted">{description}</p>}
        </div>
        {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}
