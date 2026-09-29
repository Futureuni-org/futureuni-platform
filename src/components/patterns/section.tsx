import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Section — spacing-based grouping. No borders. Optional zone treatment for backgrounded bands.
 *
 * The eyebrow rule (a subtle left rule from the Editorial Ledger direction) hangs off the
 * heading when `emphasized` is true, marking the section as "here's what's important".
 */
export function Section({
  eyebrow,
  title,
  description,
  actions,
  variant = "plain",
  emphasized,
  children,
  className,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  variant?: "plain" | "zone";
  emphasized?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-6",
        variant === "zone" && "-mx-4 rounded-lg bg-zone px-4 py-8 sm:-mx-6 sm:px-6",
        className,
      )}
    >
      {(eyebrow !== undefined || title !== undefined || actions !== undefined) && (
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            {eyebrow !== undefined && (
              <p
                data-active={emphasized === true ? "true" : undefined}
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.08em] text-muted",
                  emphasized === true && "reading-rule pl-4 text-primary-soft-foreground",
                )}
              >
                {eyebrow}
              </p>
            )}
            {title !== undefined && (
              <h2 className="font-display text-2xl font-semibold text-heading">{title}</h2>
            )}
            {description !== undefined && (
              <p className="max-w-prose text-muted">{description}</p>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
