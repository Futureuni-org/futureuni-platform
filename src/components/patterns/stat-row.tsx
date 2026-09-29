import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * StatRow — 2-up on mobile, 4-up on desktop. No cards; separation from surrounding content is
 * done with vertical rhythm (saas-ui dashboards §3). Values use the mono face with tabular
 * numbers so digit widths align.
 */

export interface Stat {
  id: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Positive/negative delta shown after the value. Colour is by "good", not by direction. */
  delta?: { value: string; good?: boolean };
  /** Optional sparkline slot rendered under the value. */
  sparkline?: ReactNode;
}

export function StatRow({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4",
        className,
      )}
    >
      {stats.map((stat) => (
        <div key={stat.id} className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{stat.label}</dt>
          <dd className="flex items-baseline gap-2 font-mono text-2xl tabular-nums text-heading md:text-3xl">
            <span>{stat.value}</span>
            {stat.delta !== undefined && (
              <span
                className={cn(
                  "text-xs font-medium",
                  stat.delta.good === true ? "text-success" : "text-danger",
                )}
              >
                {stat.delta.value}
              </span>
            )}
          </dd>
          {stat.sparkline !== undefined && <div className="mt-1">{stat.sparkline}</div>}
          {stat.hint !== undefined && (
            <p className="text-xs text-muted">{stat.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
