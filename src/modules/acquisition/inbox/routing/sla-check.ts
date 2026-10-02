import "server-only";

/**
 * SLA check job (module spec §3.12). For each open actionable reply: at 75% of the SLA notify the
 * owner (`reply.sla-warning`); at breach notify the owner and the managers (`reply.sla-breached`)
 * and record the outcome. A sent reply closes the timer (`markReplyAnswered` sets MET). Time is
 * injected (INV-12).
 */

import type { Clock } from "@/contracts/common";

import { SLA_WARN_FRACTION } from "../settings";
import { notifySafe } from "../_shared";
import { findRepliesForSlaCheck, setReplySla } from "../inbox.repo";
import { withTransaction } from "@/platform/db";

export async function runSlaCheck(clock: Clock): Promise<{ checked: number; warned: number; breached: number }> {
  const now = clock.now();
  const rows = await findRepliesForSlaCheck();
  let warned = 0;
  let breached = 0;

  for (const row of rows) {
    if (row.slaDueAt === null) continue;
    const due = row.slaDueAt.getTime();
    const start = row.receivedAt.getTime();
    const warnAt = start + (due - start) * SLA_WARN_FRACTION;
    const ownerId = row.lead?.ownerId ?? null;

    if (now.getTime() >= due && row.slaStatus !== "BREACHED") {
      await withTransaction((tx) => setReplySla(tx, row.id, { slaStatus: "BREACHED", slaBreachedAt: now }));
      breached += 1;
      if (ownerId !== null) {
        await notifySafe({
          userIds: [ownerId],
          type: "reply.sla-breached",
          title: "Reply SLA breached",
          body: "A reply has passed its response deadline.",
          data: { leadId: row.leadId ?? "" },
          dedupeKey: `reply.sla-breached:${row.id}`,
        });
      }
      await notifySafe({
        role: "MANAGER",
        type: "reply.sla-breached",
        title: "Reply SLA breached",
        body: "A reply has passed its response deadline.",
        data: { leadId: row.leadId ?? "" },
        dedupeKey: `reply.sla-breached:mgr:${row.id}`,
      });
    } else if (now.getTime() >= warnAt && row.slaStatus === "ON_TRACK") {
      await withTransaction((tx) => setReplySla(tx, row.id, { slaStatus: "WARNING", slaWarnedAt: now }));
      warned += 1;
      if (ownerId !== null) {
        await notifySafe({
          userIds: [ownerId],
          type: "reply.sla-warning",
          title: "Reply SLA at 75%",
          body: "A reply is approaching its response deadline.",
          data: { leadId: row.leadId ?? "" },
          dedupeKey: `reply.sla-warning:${row.id}`,
        });
      }
    }
  }

  return { checked: rows.length, warned, breached };
}
