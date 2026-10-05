import "server-only";

import Link from "next/link";

import { EmptyState } from "@/components/patterns/states";
import { ReadingRule } from "@/components/ui/reading-rule";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CurrentUser } from "@/platform/auth";
import type { ServiceLine } from "@/contracts/common";
import { getReviewQueueForUser } from "@/modules/acquisition/outreach";
import { lineHref } from "@/modules/acquisition/ui/shell";

/**
 * "My review queue" home widget (Phase 19): the top drafts waiting on the viewer, scoped to their
 * role. The count is the real `countReviewQueueForUser`, shared with the `acquisition.review-count`
 * nav badge so the two always agree.
 */
export async function AcquisitionReviewQueueWidget({ user }: { user: CurrentUser }) {
  const items = await getReviewQueueForUser(user.id, 3);

  if (items.length === 0) {
    return <EmptyState title="Queue clear" description="Nothing waiting on your review." />;
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.messageId}>
          <ReadingRule
            as="span"
            className="flex items-center justify-between gap-3 py-2 pr-2 text-sm"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={lineHref(item.lead.serviceLine as ServiceLine, "review")}
                className="truncate font-medium text-foreground hover:underline"
              >
                {item.company.name}
              </Link>
              {item.company.city !== null && item.company.city !== "" && (
                <span className="truncate text-xs text-muted">{item.company.city}</span>
              )}
            </span>
            <StatusBadge kind="lead" value="IN_REVIEW" />
          </ReadingRule>
        </li>
      ))}
    </ul>
  );
}
