import "server-only";

import Link from "next/link";

import { StatRow, type Stat } from "@/components/patterns/stat-row";
import { db } from "@/platform/db";
import type { CurrentUser } from "@/platform/auth";

/**
 * "Needs you" — a per-user summary of what's waiting. Reads seeded rows directly today; Phase 19
 * rewires this to the acquisition services' own count helpers.
 */
export async function NeedsYou({ user }: { user: CurrentUser }) {
  const [reviewQueue, unreadReplies, meetingsToday, overdueFollowups] = await Promise.all([
    countReviewQueue(user.id),
    countUnreadReplies(user.id),
    countMeetingsToday(user.id),
    countOverdueFollowups(user.id),
  ]);

  const stats: Stat[] = [
    {
      id: "review",
      label: "Review queue",
      value: <Link href="/acquisition" className="hover:underline">{reviewQueue}</Link>,
    },
    {
      id: "replies",
      label: "Unread replies",
      value: <Link href="/acquisition" className="hover:underline">{unreadReplies}</Link>,
    },
    {
      id: "meetings",
      label: "Meetings today",
      value: <Link href="/acquisition" className="hover:underline">{meetingsToday}</Link>,
    },
    {
      id: "followups",
      label: "Overdue follow-ups",
      value: <Link href="/acquisition" className="hover:underline">{overdueFollowups}</Link>,
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

async function countReviewQueue(userId: string): Promise<number> {
  return db.lead.count({
    where: { ownerId: userId, status: "IN_REVIEW" },
  });
}

async function countUnreadReplies(userId: string): Promise<number> {
  // A thread has unread work when its most recent inbound is newer than its snooze / read cursor.
  // Phase 4 approximates by "assigned to me and lastInboundAt within the last 7 days"; Phase 19
  // wires this to the acquisition inbox service's own counter.
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return db.inboxThread.count({
    where: {
      assigneeId: userId,
      lastInboundAt: { gte: week },
    },
  });
}

async function countMeetingsToday(userId: string): Promise<number> {
  const now = new Date();
  const dayStart = new Date(now.getTime());
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return db.meeting.count({
    where: {
      ownerId: userId,
      startsAt: { gte: dayStart, lt: dayEnd },
    },
  });
}

async function countOverdueFollowups(userId: string): Promise<number> {
  const now = new Date();
  return db.lead.count({
    where: {
      ownerId: userId,
      nextActionAt: { lt: now, not: null },
      status: { in: ["APPROVED", "CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT"] },
    },
  });
}
