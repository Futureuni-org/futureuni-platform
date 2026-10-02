import "server-only";

import { db } from "@/platform/db";
import { dailyCapForParams, platformDayIso } from "@/modules/acquisition/outreach/mailboxes/warmup";

/**
 * Interim readers for the mailboxes admin screen. The outreach module exposes only
 * `listActiveMailboxes` (ACTIVE/WARMING, minimal shape) and single-row sending-domain lookups, so
 * these `*.repo.ts` readers list ALL mailboxes and sending domains for display. Replace with
 * outreach service readers at integration — see CR-18-GAP-MAILBOX-READERS in phases/18/REQUESTS.md.
 */

export interface MailboxRow {
  id: string;
  address: string;
  domain: string;
  provider: string;
  status: "WARMING" | "ACTIVE" | "PAUSED" | "DISABLED";
  pausedReason: string | null;
  warmupDay: number;
  todaysCap: number;
  dailyCapTarget: number;
  sentToday: number;
  hardBouncesToday: number;
  repliesToday: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  warmupStartCap: number;
  warmupRampDays: number;
}

export interface SendingDomainRow {
  id: string;
  domain: string;
  provider: string;
  dkimSelector: string;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  mxStatus: string;
  fixes: { record: string; fix: string | null; status: string }[];
  lastCheckedAt: Date | null;
}

export async function listMailboxes(): Promise<MailboxRow[]> {
  const today = platformDayIso(new Date());
  const [mailboxes, stats] = await Promise.all([
    db.mailbox.findMany({
      orderBy: { address: "asc" },
      select: {
        id: true,
        address: true,
        provider: true,
        status: true,
        pausedReason: true,
        warmupStartDate: true,
        warmupStartCap: true,
        dailyCapTarget: true,
        warmupRampDays: true,
        sendWindowStart: true,
        sendWindowEnd: true,
        sendingDomain: { select: { domain: true } },
      },
    }),
    db.mailboxDailyStat.findMany({
      where: { day: new Date(today) },
      select: { mailboxId: true, sent: true, bouncesHard: true, replies: true },
    }),
  ]);
  const statByMailbox = new Map(stats.map((s) => [s.mailboxId, s]));
  const dayMs = 24 * 60 * 60 * 1000;

  return mailboxes.map((m) => {
    const startIso = platformDayIso(m.warmupStartDate);
    const warmupDay = Math.max(0, Math.floor((Date.now() - m.warmupStartDate.getTime()) / dayMs));
    const stat = statByMailbox.get(m.id);
    return {
      id: m.id,
      address: m.address,
      domain: m.sendingDomain.domain,
      provider: m.provider,
      status: m.status,
      pausedReason: m.pausedReason,
      warmupDay,
      todaysCap: dailyCapForParams(
        {
          warmupStartDate: startIso,
          warmupStartCap: m.warmupStartCap,
          dailyCapTarget: m.dailyCapTarget,
          warmupRampDays: m.warmupRampDays,
        },
        today,
      ),
      dailyCapTarget: m.dailyCapTarget,
      sentToday: stat?.sent ?? 0,
      hardBouncesToday: stat?.bouncesHard ?? 0,
      repliesToday: stat?.replies ?? 0,
      sendWindowStart: m.sendWindowStart,
      sendWindowEnd: m.sendWindowEnd,
      warmupStartCap: m.warmupStartCap,
      warmupRampDays: m.warmupRampDays,
    };
  });
}

export async function listSendingDomains(): Promise<SendingDomainRow[]> {
  const rows = await db.sendingDomain.findMany({
    orderBy: { domain: "asc" },
    select: {
      id: true,
      domain: true,
      provider: true,
      dkimSelector: true,
      spfStatus: true,
      dkimStatus: true,
      dmarcStatus: true,
      mxStatus: true,
      dnsDetails: true,
      lastCheckedAt: true,
    },
  });
  return rows.map((r) => {
    const details = (r.dnsDetails ?? {}) as {
      spf?: { fix?: string | null };
      dkim?: { fix?: string | null };
      dmarc?: { fix?: string | null };
      mx?: { fix?: string | null };
    };
    return {
      id: r.id,
      domain: r.domain,
      provider: r.provider,
      dkimSelector: r.dkimSelector,
      spfStatus: r.spfStatus,
      dkimStatus: r.dkimStatus,
      dmarcStatus: r.dmarcStatus,
      mxStatus: r.mxStatus,
      fixes: [
        { record: "SPF", status: r.spfStatus, fix: details.spf?.fix ?? null },
        { record: "DKIM", status: r.dkimStatus, fix: details.dkim?.fix ?? null },
        { record: "DMARC", status: r.dmarcStatus, fix: details.dmarc?.fix ?? null },
        { record: "MX", status: r.mxStatus, fix: details.mx?.fix ?? null },
      ],
      lastCheckedAt: r.lastCheckedAt,
    };
  });
}
