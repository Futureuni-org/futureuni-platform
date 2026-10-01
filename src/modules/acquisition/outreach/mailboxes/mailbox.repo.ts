import "server-only";

/**
 * Data access for mailboxes, sending domains and daily send stats. The only place these tables are
 * read or written (naming convention: `*.repo.ts`).
 */

import {
  dbOr,
  type Mailbox,
  type MailboxDailyStat,
  type Prisma,
  type SendingDomain,
  type Tx,
} from "@/platform/db";
import type { MailboxConfig } from "@/contracts/outreach-channel";
import type { ProviderId } from "@/contracts/common";

import { platformDayIso } from "./warmup";

/** Statuses that may send today (PAUSED and DISABLED may not). */
export const SENDABLE_STATUSES = ["ACTIVE", "WARMING"] as const;

function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Maps a Mailbox row to the contract's {@link MailboxConfig}. */
export function toMailboxConfig(row: Mailbox): MailboxConfig {
  return {
    id: row.id,
    address: row.address,
    displayName: row.displayName,
    provider: row.provider as MailboxConfig["provider"],
    credentialProvider: row.credentialProvider as ProviderId,
    status: row.status,
    warmupStartDate: isoDateOf(row.warmupStartDate),
    warmupStartCap: row.warmupStartCap,
    dailyCapTarget: row.dailyCapTarget,
    warmupRampDays: row.warmupRampDays,
    sendWindowStart: row.sendWindowStart,
    sendWindowEnd: row.sendWindowEnd,
  };
}

export function findMailbox(tx: Tx | null, id: string): Promise<Mailbox | null> {
  return dbOr(tx).mailbox.findUnique({ where: { id } });
}

export function findMailboxByAddress(tx: Tx | null, address: string): Promise<Mailbox | null> {
  return dbOr(tx).mailbox.findUnique({ where: { address } });
}

export function listSendableMailboxes(tx: Tx | null): Promise<Mailbox[]> {
  return dbOr(tx).mailbox.findMany({
    where: { status: { in: [...SENDABLE_STATUSES] } },
    orderBy: { createdAt: "asc" },
  });
}

export function createMailbox(tx: Tx | null, data: Prisma.MailboxUncheckedCreateInput): Promise<Mailbox> {
  return dbOr(tx).mailbox.create({ data });
}

export function updateMailbox(
  tx: Tx | null,
  id: string,
  data: Prisma.MailboxUncheckedUpdateInput,
): Promise<Mailbox> {
  return dbOr(tx).mailbox.update({ where: { id }, data });
}

export function findSendingDomain(tx: Tx | null, id: string): Promise<SendingDomain | null> {
  return dbOr(tx).sendingDomain.findUnique({ where: { id } });
}

export function findSendingDomainByName(
  tx: Tx | null,
  domain: string,
): Promise<SendingDomain | null> {
  return dbOr(tx).sendingDomain.findUnique({ where: { domain } });
}

export function updateSendingDomain(
  tx: Tx | null,
  id: string,
  data: Prisma.SendingDomainUncheckedUpdateInput,
): Promise<SendingDomain> {
  return dbOr(tx).sendingDomain.update({ where: { id }, data });
}

function dayDate(dayIso: string): Date {
  return new Date(`${dayIso}T00:00:00.000Z`);
}

/** The current send count for a mailbox on the given platform day (0 when no row exists yet). */
export async function sentToday(tx: Tx | null, mailboxId: string, dayIso: string): Promise<number> {
  const row = await dbOr(tx).mailboxDailyStat.findUnique({
    where: { mailboxId_day: { mailboxId, day: dayDate(dayIso) } },
    select: { sent: true },
  });
  return row?.sent ?? 0;
}

/**
 * Atomically reserves one send against today's cap. Returns true when the reservation succeeded,
 * false when the mailbox is already at its cap. The guard (`sent < cap`) runs inside one SQL UPDATE,
 * so concurrent ticks can never exceed the cap (INV-8).
 */
export async function tryReserveDailySend(
  tx: Tx,
  mailboxId: string,
  dayIso: string,
  cap: number,
): Promise<boolean> {
  const day = dayDate(dayIso);
  await tx.mailboxDailyStat.upsert({
    where: { mailboxId_day: { mailboxId, day } },
    create: { mailboxId, day },
    update: {},
  });
  const res = await tx.mailboxDailyStat.updateMany({
    where: { mailboxId, day, sent: { lt: cap } },
    data: { sent: { increment: 1 } },
  });
  return res.count === 1;
}

/** Releases a previously reserved send (used when the provider send fails after reservation). */
export async function releaseDailySend(tx: Tx, mailboxId: string, dayIso: string): Promise<void> {
  await tx.mailboxDailyStat.updateMany({
    where: { mailboxId, day: dayDate(dayIso), sent: { gt: 0 } },
    data: { sent: { decrement: 1 } },
  });
}

/** Increments a bounce/complaint/reply counter on a mailbox's daily stat for a given day. */
export async function bumpDailyCounter(
  tx: Tx | null,
  mailboxId: string,
  day: Date,
  field: "bouncesHard" | "bouncesSoft" | "complaints" | "replies",
): Promise<void> {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  await dbOr(tx).mailboxDailyStat.upsert({
    where: { mailboxId_day: { mailboxId, day: d } },
    create: { mailboxId, day: d, [field]: 1 },
    update: { [field]: { increment: 1 } },
  });
}

/**
 * Hard-bounce rate over the most recent sends, summed from daily stats until the sample size is
 * reached. Returns null when there are not yet any recorded sends.
 */
export async function recentHardBounceRate(
  tx: Tx | null,
  mailboxId: string,
  sampleSize: number,
): Promise<{ rate: number; sampled: number } | null> {
  const rows = await dbOr(tx).mailboxDailyStat.findMany({
    where: { mailboxId },
    orderBy: { day: "desc" },
    take: 60,
    select: { sent: true, bouncesHard: true },
  });
  let sent = 0;
  let hard = 0;
  for (const row of rows) {
    sent += row.sent;
    hard += row.bouncesHard;
    if (sent >= sampleSize) break;
  }
  if (sent === 0) return null;
  return { rate: hard / sent, sampled: sent };
}

/** Today's platform-day ISO date for a clock instant. */
export function todayIso(now: Date): string {
  return platformDayIso(now);
}

export type { Mailbox, MailboxDailyStat, SendingDomain };
