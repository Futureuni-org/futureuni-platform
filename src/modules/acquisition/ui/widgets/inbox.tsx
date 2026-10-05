import "server-only";

import Link from "next/link";

import { EmptyState } from "@/components/patterns/states";
import { ReadingRule } from "@/components/ui/reading-rule";
import { actorOf, type CurrentUser } from "@/platform/auth";
import { getInboxCounts } from "@/modules/acquisition/inbox";
import { lineHref, lineLabel } from "@/modules/acquisition/ui/shell";

/**
 * "My inbox" home widget (Phase 19): the viewer's actionable reply count with a per-line breakdown,
 * from the real inbox service (`getInboxCounts`), so the widget and the Inbox nav badge agree.
 */
export async function AcquisitionInboxWidget({ user }: { user: CurrentUser }) {
  const { byLine, totalActionable, totalUnread } = await getInboxCounts(actorOf(user), user.id);

  if (totalActionable === 0 && totalUnread === 0) {
    return <EmptyState title="Inbox is quiet" description="No replies to look at right now." />;
  }

  const actionableLines = byLine.filter((line) => line.actionable > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-2xl font-semibold tabular-nums text-heading">
          {totalActionable}
        </span>
        <span className="text-sm text-muted">
          need a reply{totalUnread > totalActionable ? ` · ${String(totalUnread)} unread` : ""}
        </span>
      </div>
      {actionableLines.length > 0 && (
        <ul className="flex flex-col gap-1">
          {actionableLines.map((line) => (
            <li key={line.serviceLine}>
              <ReadingRule
                as="span"
                className="flex items-center justify-between gap-3 py-1.5 pr-2 text-sm"
              >
                <Link href={lineHref(line.serviceLine, "inbox")} className="truncate hover:underline">
                  {lineLabel(line.serviceLine)}
                </Link>
                <span className="font-mono tabular-nums text-muted">{line.actionable}</span>
              </ReadingRule>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
