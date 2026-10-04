import "server-only";

/**
 * Supplements `@/modules/acquisition/inbox` `getThread`, which returns each message and reply
 * without its channel, cited findings, extracted follow-up date or referral. The inbox and the
 * lead-detail Conversation tab both show those, so this `*.repo.ts` reads them by lead. See
 * CR-16-GAP-THREAD-FIELDS in phases/16/REQUESTS.md — `getThread` should return these fields itself.
 * Callers authorise through `getThread` first (it checks `acquisition.inbox.read`).
 */

import type { Channel } from "@/contracts/common";
import { db, type Prisma } from "@/platform/db";

export interface ThreadExtras {
  messages: Map<string, { channel: Channel; citations: { id: string; claim: string }[] }>;
  replies: Map<string, { followUpDate: Date | null; referral: Prisma.JsonValue | null }>;
}

export async function getThreadExtras(leadId: string): Promise<ThreadExtras> {
  const [messages, replies] = await Promise.all([
    db.message.findMany({
      where: { leadId },
      select: {
        id: true,
        channel: true,
        citations: {
          select: {
            finding: { select: { id: true, claim: true } },
            signal: { select: { id: true, evidenceText: true } },
          },
        },
      },
    }),
    db.reply.findMany({
      where: { leadId },
      select: { id: true, followUpDate: true, referral: true },
    }),
  ]);

  return {
    messages: new Map(
      messages.map((m) => [
        m.id,
        {
          channel: m.channel,
          citations: m.citations.flatMap((c) => {
            if (c.finding !== null) return [{ id: c.finding.id, claim: c.finding.claim }];
            if (c.signal !== null) return [{ id: c.signal.id, claim: c.signal.evidenceText }];
            return [];
          }),
        },
      ]),
    ),
    replies: new Map(
      replies.map((r) => [r.id, { followUpDate: r.followUpDate, referral: r.referral }]),
    ),
  };
}
