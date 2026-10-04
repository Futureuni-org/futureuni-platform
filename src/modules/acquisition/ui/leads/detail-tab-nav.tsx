import Link from "next/link";

import { cn } from "@/lib/cn";

import { DETAIL_TABS, type DetailTabId } from "./detail-types";

/**
 * The lead-detail tabs. Each is a link that sets `?tab=`, so a tab can be shared and the server
 * loads only that tab's data (B3.7, B3.8). Scrolls sideways inside itself on narrow screens.
 */
export function DetailTabNav({ basePath, active }: { basePath: string; active: DetailTabId }) {
  return (
    <nav aria-label="Lead sections" className="overflow-x-auto">
      <ul className="flex min-w-max items-center gap-6 border-b border-border">
        {DETAIL_TABS.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.id === "overview" ? basePath : `${basePath}?tab=${tab.id}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                // The underline and the focus ring are drawn inside the link's box. The nav scrolls
                // sideways, which clips anything that sticks out of it, including a 1px overhang.
                className={cn(
                  "relative inline-flex h-12 items-center px-1 text-sm font-medium text-muted hover:text-foreground",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                  current &&
                    "text-heading after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
