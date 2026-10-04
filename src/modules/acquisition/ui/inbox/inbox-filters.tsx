"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { FilterBar, UrlSelect, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { statusMeta } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";

import { UrlToggle } from "../leads/url-toggle";
import { REPLY_CLASSES, SLA_LABEL, SLA_STATUSES, type InboxTab } from "./inbox-types";

const MARKET_OPTIONS: SelectOption[] = [
  { value: "NIGERIA", label: "Nigeria" },
  { value: "INTERNATIONAL", label: "International" },
];

const CLASS_OPTIONS: SelectOption[] = REPLY_CLASSES.map((value) => ({
  value,
  label: statusMeta("reply", value).label,
}));

const SLA_OPTIONS: SelectOption[] = SLA_STATUSES.filter((status) => status !== "NONE").map(
  (status) => ({ value: status, label: SLA_LABEL[status] }),
);

// What survives a switch between the two tabs: neither a filter nor the open thread applies to both.
const FILTER_KEYS = ["class", "sla", "market", "owner", "unread", "review", "limit"];

/** The inbox's two views and its filters. Everything is in the URL, so a view can be shared. */
export function InboxFilters({
  tab,
  owners,
  unmatchedCount,
  showUnmatched,
}: {
  tab: InboxTab;
  owners: SelectOption[];
  unmatchedCount: number | null;
  showUnmatched: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtered = FILTER_KEYS.some((key) => searchParams.has(key));

  const tabs: { id: InboxTab; label: string; href: string }[] = [
    { id: "threads", label: "Threads", href: pathname },
    ...(showUnmatched
      ? [
          {
            id: "unmatched" as const,
            label:
              unmatchedCount === null || unmatchedCount === 0
                ? "Unmatched"
                : `Unmatched (${String(unmatchedCount)})`,
            href: `${pathname}?tab=unmatched`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Inbox views">
        <ul className="flex items-center gap-6 border-b border-border">
          {tabs.map((entry) => {
            const current = entry.id === tab;
            return (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative -mb-px inline-flex h-12 min-w-12 items-center justify-center px-1 text-sm font-medium text-muted hover:text-foreground",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    current &&
                      "text-heading after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary",
                  )}
                >
                  {entry.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "threads" && (
        <>
          <FilterBar>
            <UrlSelect
              paramKey="class"
              label="Class"
              options={CLASS_OPTIONS}
              allLabel="Any class"
            />
            <UrlSelect paramKey="sla" label="Response timer" options={SLA_OPTIONS} allLabel="Any" />
            <UrlSelect paramKey="owner" label="Owner" options={owners} allLabel="Any owner" />
            <UrlSelect
              paramKey="market"
              label="Market"
              options={MARKET_OPTIONS}
              allLabel="All markets"
            />
          </FilterBar>
          <div className="flex flex-wrap items-center gap-2">
            <UrlToggle paramKey="unread" label="Unread" />
            <UrlToggle paramKey="review" label="Needs review" />
            {filtered && (
              <Button
                variant="ghost"
                onClick={() => {
                  const thread = searchParams.get("thread");
                  router.replace(
                    thread === null ? pathname : `${pathname}?thread=${encodeURIComponent(thread)}`,
                    { scroll: false },
                  );
                }}
              >
                <X aria-hidden className="size-4" />
                Clear
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
