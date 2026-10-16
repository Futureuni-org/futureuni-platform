"use client";

/**
 * The deep-navy band across the top of the public form on mobile (below `md`).
 *
 * Carries the FUTUREUNI lockup on the left, the appearance toggle on the right,
 * and the progress rail underneath. **`bg-sidebar` + `text-sidebar-foreground`**
 * — the "always navy, in both themes" tokens — not `bg-heading`, which flips
 * to white in dark mode (see memory `futureuni-navy-rail-token`). The desktop
 * header on the page background is handled by the form view itself; this
 * component only exists for the mobile viewport, hence `md:hidden` applied by
 * the caller.
 */

import Image from "next/image";

import { cn } from "@/lib/cn";

import { ThemeSwitch } from "./theme-switch";

export function MobileBand({
  answered,
  total,
  className,
}: {
  answered: number;
  total: number;
  className?: string;
}) {
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);
  return (
    <aside
      className={cn(
        "flex flex-col gap-3 bg-sidebar px-5 py-4 text-sidebar-foreground",
        "sticky top-0 z-10",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-3">
          <Image
            src="/brand/futureuni-mark.png"
            alt=""
            width={28}
            height={36}
            priority
            className="h-8 w-auto"
          />
          <span className="font-display text-lg font-semibold tracking-[0.02em]">FUTUREUNI</span>
        </span>
        <ThemeSwitch tone="navy" className="-mr-2" />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="flex items-baseline justify-between text-xs text-sidebar-foreground/70">
          <span className="font-mono tabular-nums">
            {answered} of {total} answered
          </span>
          <span className="font-mono tabular-nums">{percent}%</span>
        </p>
        <div
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Questions answered"
          className="h-1 w-full overflow-hidden rounded-full bg-sidebar-foreground/15"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-base)] ease-[var(--motion-ease-standard)]"
            style={{ width: `${String(percent)}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
