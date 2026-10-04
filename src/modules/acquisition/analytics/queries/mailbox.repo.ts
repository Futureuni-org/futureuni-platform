/**
 * Deliverability snapshot for the overview (Phase 17): mailbox status counts and the hard-bounce
 * rate across mailbox daily stats in the range. Read-only aggregate over the outreach mailbox
 * tables; the outreach module's per-mailbox health service isn't a list reader, so this summarises
 * directly (no health logic is re-implemented).
 */

import "server-only";

import { db } from "@/platform/db";

export interface MailboxSnapshot {
  activeMailboxes: number;
  pausedMailboxes: number;
  warmingMailboxes: number;
  /** Hard bounces ÷ sent across the range, `0..1`; null when nothing was sent. */
  hardBounceRate: number | null;
}

export async function getMailboxSnapshot(from: Date, to: Date): Promise<MailboxSnapshot> {
  const [byStatus, totals] = await Promise.all([
    db.mailbox.groupBy({ by: ["status"], _count: { _all: true } }),
    db.mailboxDailyStat.aggregate({
      where: { day: { gte: startOfDay(from), lte: to } },
      _sum: { sent: true, bouncesHard: true },
    }),
  ]);
  const count = (status: string): number =>
    byStatus.find((s) => s.status === status)?._count._all ?? 0;
  const sent = totals._sum.sent ?? 0;
  const bounces = totals._sum.bouncesHard ?? 0;
  return {
    activeMailboxes: count("ACTIVE"),
    pausedMailboxes: count("PAUSED"),
    warmingMailboxes: count("WARMING"),
    hardBounceRate: sent === 0 ? null : bounces / sent,
  };
}

/** MailboxDailyStat.day is a date-only column; normalise `from` to its date start. */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
