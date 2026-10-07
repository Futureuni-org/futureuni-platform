"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The service-line tab bar: the four lines plus Overview. The active tab is marked with a 2px
 * reading rule in the line's own accent. On mobile the bar scrolls horizontally with snap and the
 * active tab is scrolled into view.
 */

export interface LineTab {
  /** The URL slug (also the value `useSelectedLayoutSegment` returns for the active line). */
  slug: string;
  label: string;
  href: string;
  /** Token name, e.g. `chart-1`; rendered as `var(--chart-1)`. */
  accentToken: string;
}

export interface OverviewTab {
  label: string;
  href: string;
}

export function LineTabs({
  lines,
  overview,
}: {
  lines: LineTab[];
  overview: OverviewTab | null;
}): React.ReactElement {
  const segment = useSelectedLayoutSegment();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    // Scroll the strip itself, never `scrollIntoView`: scrollIntoView walks ancestor scrollers
    // (including the viewport), which scrolls the page on load and, under mobile Chrome,
    // triggers a zoom-out that expands the layout viewport (the stretched-bottom-nav bug).
    const tab = activeRef.current;
    const strip = tab?.closest("ul");
    if (tab == null || strip == null) return;
    strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  }, [segment]);

  return (
    <nav aria-label="Service lines" className="min-w-0">
      <ul className="flex snap-x gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lines.map((tab) => {
          const active = segment === tab.slug;
          return (
            <li key={tab.slug} className="snap-start">
              <Link
                ref={active ? activeRef : undefined}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                style={{ ["--line-accent" as string]: `var(--${tab.accentToken})` }}
                className={[
                  "relative inline-flex h-11 items-center whitespace-nowrap rounded-t-md px-3 text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active ? "text-heading" : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ backgroundColor: "var(--line-accent)" }}
                />
                {tab.label}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--line-accent)" }}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
        {overview !== null ? (
          <li className="snap-start">
            <Link
              ref={segment === "overview" ? activeRef : undefined}
              href={overview.href}
              aria-current={segment === "overview" ? "page" : undefined}
              className={[
                "relative inline-flex h-11 items-center whitespace-nowrap rounded-t-md px-3 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                segment === "overview" ? "text-heading" : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              {overview.label}
              {segment === "overview" ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                />
              ) : null}
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
