import "server-only";

import Link from "next/link";

import { EmptyState } from "@/components/patterns/states";
import { ReadingRule } from "@/components/ui/reading-rule";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/platform/db";

import type { WidgetProps } from "../widget-registry";

/** Placeholder widget: reads seeded leads directly; Phase 19 wires it to the real service. */
export async function AcquisitionReviewQueueWidget({ user }: WidgetProps) {
  const rows = await db.lead.findMany({
    where: {
      ownerId: user.id,
      status: "IN_REVIEW",
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      company: { select: { name: true, city: true } },
    },
  });

  if (rows.length === 0) {
    return (
      <EmptyState title="Queue clear" description="Nothing waiting on your review." />
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.id}>
          <ReadingRule
            as="span"
            className="flex items-center justify-between gap-3 py-2 pr-2 text-sm"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <Link
                href="/acquisition"
                className="truncate font-medium text-foreground hover:underline"
              >
                {row.company.name}
              </Link>
              {row.company.city !== null && row.company.city !== "" && (
                <span className="truncate text-xs text-muted">{row.company.city}</span>
              )}
            </span>
            <StatusBadge kind="lead" value={row.status} />
          </ReadingRule>
        </li>
      ))}
    </ul>
  );
}
