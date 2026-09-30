import "server-only";

import Link from "next/link";

import { EmptyState } from "@/components/patterns/states";
import { ReadingRule } from "@/components/ui/reading-rule";
import { RelativeTime } from "@/components/ui/relative-time";
import { db } from "@/platform/db";

import type { WidgetProps } from "../widget-registry";

/** Placeholder widget: reads inbox threads directly; Phase 19 wires it to the inbox service. */
export async function AcquisitionInboxWidget({ user }: WidgetProps) {
  const rows = await db.inboxThread.findMany({
    where: { assigneeId: user.id, lastInboundAt: { not: null } },
    orderBy: { lastInboundAt: "desc" },
    take: 5,
    select: {
      id: true,
      lastInboundAt: true,
      lead: { select: { company: { select: { name: true } } } },
    },
  });

  if (rows.length === 0) {
    return <EmptyState title="Inbox is quiet" description="No replies to look at right now." />;
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.id}>
          <ReadingRule
            as="span"
            className="flex items-center justify-between gap-3 py-2 pr-2 text-sm"
          >
            <Link href="/acquisition" className="truncate font-medium hover:underline">
              {row.lead.company.name}
            </Link>
            {row.lastInboundAt !== null && (
              <RelativeTime value={row.lastInboundAt} timezone={user.timezone} className="text-xs" />
            )}
          </ReadingRule>
        </li>
      ))}
    </ul>
  );
}
