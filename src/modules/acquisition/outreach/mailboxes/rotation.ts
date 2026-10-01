import "server-only";

/**
 * Mailbox rotation (step 4.5): keep a lead's thread on the same mailbox, otherwise pick the
 * sendable mailbox with the most remaining capacity today. Capacity is the warm-up cap minus the
 * sends already made today (INV-8). Returns null when every sendable mailbox is at its cap.
 */

import type { Mailbox, Tx } from "@/platform/db";

import { dailyCapFor } from "./warmup";
import {
  findMailbox,
  listSendableMailboxes,
  sentToday,
  toMailboxConfig,
  SENDABLE_STATUSES,
} from "./mailbox.repo";
import { platformDayIso } from "./warmup";

export interface MailboxPick {
  mailbox: Mailbox;
  cap: number;
  remaining: number;
}

async function remainingFor(tx: Tx | null, mailbox: Mailbox, dayIso: string): Promise<MailboxPick> {
  const cap = dailyCapFor(toMailboxConfig(mailbox), dayIso);
  const sent = await sentToday(tx, mailbox.id, dayIso);
  return { mailbox, cap, remaining: cap - sent };
}

function isSendable(mailbox: Mailbox): boolean {
  return (SENDABLE_STATUSES as readonly string[]).includes(mailbox.status);
}

/**
 * Picks a mailbox for a send. `preferredMailboxId` (the thread's mailbox) wins when it is still
 * sendable and has capacity; otherwise the mailbox with the most remaining capacity is chosen.
 */
export async function pickMailbox(
  tx: Tx | null,
  now: Date,
  preferredMailboxId: string | null,
): Promise<MailboxPick | null> {
  const dayIso = platformDayIso(now);

  if (preferredMailboxId !== null) {
    const preferred = await findMailbox(tx, preferredMailboxId);
    if (preferred !== null && isSendable(preferred)) {
      const pick = await remainingFor(tx, preferred, dayIso);
      if (pick.remaining > 0) return pick;
    }
  }

  const mailboxes = await listSendableMailboxes(tx);
  let best: MailboxPick | null = null;
  for (const mailbox of mailboxes) {
    const pick = await remainingFor(tx, mailbox, dayIso);
    if (pick.remaining <= 0) continue;
    if (best === null || pick.remaining > best.remaining) best = pick;
  }
  return best;
}
