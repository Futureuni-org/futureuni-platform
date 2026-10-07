import "server-only";

import Link from "next/link";

import { StatRow, type Stat } from "@/components/patterns/stat-row";
import { actorOf, type CurrentUser } from "@/platform/auth";
import { countReviewQueueForUser } from "@/modules/acquisition/outreach";
import { getInboxCounts } from "@/modules/acquisition/inbox";
import { getOverdueNextActions, getPipelineWidgetData } from "@/modules/acquisition/pipeline";

/**
 * "Needs you" — a per-user summary of what's waiting, from the acquisition services' own count
 * helpers (Phase 19). The review count is `countReviewQueueForUser`, the same source as the
 * "My review queue" widget and the Review nav badge, so the three always agree.
 */
export async function NeedsYou({ user }: { user: CurrentUser }) {
  const actor = actorOf(user);
  const [reviewQueue, inbox, pipeline, overdue] = await Promise.all([
    countReviewQueueForUser(user.id),
    getInboxCounts(actor, user.id),
    getPipelineWidgetData(user.id, { now: () => new Date() }),
    getOverdueNextActions(actor),
  ]);

  // Negative margin + padding keeps the number visually in place while the tap target reaches
  // the 48px touch rule.
  const statLink =
    "inline-block rounded-md -m-2 p-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const stats: Stat[] = [
    {
      id: "review",
      label: "Review queue",
      value: <Link href="/acquisition" className={statLink}>{reviewQueue}</Link>,
    },
    {
      id: "replies",
      label: "Replies to action",
      value: <Link href="/acquisition" className={statLink}>{inbox.totalActionable}</Link>,
    },
    {
      id: "meetings",
      label: "Meetings today",
      value: <Link href="/acquisition" className={statLink}>{pipeline.meetingsToday}</Link>,
    },
    {
      id: "followups",
      label: "Overdue follow-ups",
      value: <Link href="/acquisition" className={statLink}>{overdue.length}</Link>,
    },
  ];

  return (
    <div className="-mx-4 rounded-lg bg-zone px-4 py-8 sm:-mx-6 sm:px-6">
      <p className="mb-6 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Needs you
      </p>
      <StatRow stats={stats} />
    </div>
  );
}
