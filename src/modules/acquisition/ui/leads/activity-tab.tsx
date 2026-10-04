import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import type { LeadEventKind } from "@/contracts/common";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/patterns/states";
import { cn } from "@/lib/cn";

import type { ActivityView } from "./detail-types";
import { Timeline, TimelineItem } from "./timeline";

export const ACTIVITY_KINDS: { value: LeadEventKind; label: string; verb: string }[] = [
  { value: "STATUS_CHANGE", label: "Status", verb: "changed the status" },
  { value: "OWNER_CHANGE", label: "Owner", verb: "changed the owner" },
  { value: "SCORE_CHANGE", label: "Score", verb: "re-scored the lead" },
  { value: "SIGNAL_ATTACHED", label: "Signals", verb: "attached a signal" },
  { value: "NOTE", label: "Notes", verb: "added a note" },
  { value: "FLAG", label: "Flags", verb: "flagged the lead" },
];

export function parseActivityKind(raw: string | string[] | undefined): LeadEventKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ACTIVITY_KINDS.find((k) => k.value === value)?.value ?? null;
}

/** The Activity tab: every lead event as a timeline (who, what, when, from → to), filterable. */
export function ActivityTab({
  events,
  kind,
  basePath,
  timezone,
}: {
  events: ActivityView[];
  kind: LeadEventKind | null;
  basePath: string;
  timezone: string;
}) {
  const filters: { value: LeadEventKind | null; label: string }[] = [
    { value: null, label: "All" },
    ...ACTIVITY_KINDS,
  ];

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Filter activity" className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter.value === kind;
          return (
            <Link
              key={filter.label}
              href={
                filter.value === null
                  ? `${basePath}?tab=activity`
                  : `${basePath}?tab=activity&kind=${filter.value}`
              }
              aria-current={active ? "true" : undefined}
              scroll={false}
              className={cn(
                "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "border-primary bg-primary-soft text-primary-soft-foreground"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {/* The chosen filter is marked by the tick as well as the colour. */}
              {active && <Check aria-hidden className="size-4" />}
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {events.length === 0 ? (
        <EmptyState
          title="No activity to show"
          description="Nothing has been recorded for this filter yet."
        />
      ) : (
        <Timeline className="max-w-prose">
          {events.map((event) => {
            const verb =
              ACTIVITY_KINDS.find((k) => k.value === event.kind)?.verb ?? "updated the lead";
            return (
              <TimelineItem key={event.id}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-heading">{event.actorLabel ?? "Someone"}</span>
                  <span className="text-foreground">{verb}</span>
                  <RelativeTime value={event.createdAt} timezone={timezone} />
                </div>
                {event.toStatus !== null && (
                  <div className="flex flex-wrap items-center gap-2">
                    {event.fromStatus !== null && (
                      <>
                        <StatusBadge kind="lead" value={event.fromStatus} />
                        <ArrowRight aria-hidden className="size-4 text-muted" />
                        <span className="sr-only">to</span>
                      </>
                    )}
                    <StatusBadge kind="lead" value={event.toStatus} />
                  </div>
                )}
                {event.reason !== null && (
                  <p className="text-sm break-words text-muted">{event.reason}</p>
                )}
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </div>
  );
}
