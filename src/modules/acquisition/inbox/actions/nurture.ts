import "server-only";

/**
 * Nurture reminder job (module spec §3.12). On the follow-up date of a NOT_NOW lead, notify the
 * owner (`nurture.follow-up-due`). The dedupe key includes the day, so a lead still due tomorrow is
 * reminded again but never twice on the same day. Time is injected (INV-12).
 */

import type { Clock } from "@/contracts/common";

import { notifySafe } from "../_shared";
import { findDueNurtureReminders } from "../inbox.repo";

export async function runNurtureReminders(clock: Clock): Promise<{ due: number; notified: number }> {
  const now = clock.now();
  const leads = await findDueNurtureReminders(now);
  const day = now.toISOString().slice(0, 10);
  let notified = 0;

  for (const lead of leads) {
    if (lead.ownerId === null) continue;
    await notifySafe({
      userIds: [lead.ownerId],
      type: "nurture.follow-up-due",
      title: "Follow-up due",
      body: `A nurtured lead is due for follow-up: ${lead.company.name}.`,
      data: { leadId: lead.id, serviceLine: lead.serviceLine },
      dedupeKey: `nurture.follow-up-due:${lead.id}:${day}`,
    });
    notified += 1;
  }

  return { due: leads.length, notified };
}
