"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getSectionBadges } from "./badges";
import { REFRESH_BADGES_EVENT } from "./line-context";
import type { SectionBadgeCounts, SectionBadgeKind } from "./sections";

/**
 * The line's section navigation (Search, Review, Leads, …). The active section carries a 2px
 * reading rule. Review/Inbox/Pipeline show live count badges that refresh on mount, on a light
 * 20s poll, and whenever a mutation dispatches the `acq:refresh-badges` window event.
 */

export { REFRESH_BADGES_EVENT };

export interface SectionNavItem {
  segment: string;
  label: string;
  href: string;
  badge?: SectionBadgeKind;
}

const POLL_MS = 20_000;

export function SectionNav({
  slug,
  items,
}: {
  slug: string;
  items: SectionNavItem[];
}): React.ReactElement {
  const active = useSelectedLayoutSegment();
  const [counts, setCounts] = useState<SectionBadgeCounts | null>(null);

  const hasBadges = items.some((i) => i.badge !== undefined);

  const refresh = useCallback(() => {
    if (!hasBadges) return;
    void getSectionBadges(slug).then((res) => {
      if (res.ok) setCounts(res.data);
    });
  }, [slug, hasBadges]);

  useEffect(() => {
    refresh();
    if (!hasBadges) return;
    const timer = window.setInterval(refresh, POLL_MS);
    const onRefresh = (): void => {
      refresh();
    };
    window.addEventListener(REFRESH_BADGES_EVENT, onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REFRESH_BADGES_EVENT, onRefresh);
    };
  }, [refresh, hasBadges]);

  return (
    <nav aria-label="Line sections" className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = active === item.segment;
          const count = badgeValue(counts, item.badge);
          const more = item.badge === "review" && counts?.reviewMore === true;
          return (
            <li key={item.segment} className="snap-start">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "font-semibold text-heading"
                    : "font-medium text-muted hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
                {count !== null && count > 0 ? (
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 font-mono text-xs tabular-nums text-primary-soft-foreground"
                    aria-label={`${String(count)}${more ? " or more" : ""} ${item.label.toLowerCase()} waiting`}
                  >
                    {count}
                    {more ? "+" : ""}
                  </span>
                ) : null}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function badgeValue(counts: SectionBadgeCounts | null, kind?: SectionBadgeKind): number | null {
  if (kind === undefined || counts === null) return null;
  return counts[kind];
}
