import "server-only";

/**
 * The advance sweeper (Phase 19): the safety net under the event-driven lead-advance workflow.
 *
 * It picks up leads that have sat in a pre-contact status past the stuck threshold — ordered by
 * score (then FIFO) so the best leads recover first — and re-queues their advance. A lead that has
 * exhausted its restarts is flagged for manual attention and a `lead.needsAttention` event is
 * published. Cross-sell-held and already-flagged leads are left alone (they are parked on purpose).
 */

import type { JobResult } from "@/contracts/jobs";
import { db } from "@/platform/db";
import { publish } from "@/platform/events";

import { getAdvanceSettings } from "./settings";
import { requeueAdvance } from "./start";

/** Pre-contact statuses a stuck lead can sit in (mirrors `start.ts`'s ADVANCEABLE set). */
const ADVANCEABLE = ["NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED", "SCORED"] as const;

export async function sweepStuckLeads(batchSize: number): Promise<JobResult> {
  const { stuckThresholdMinutes, maxRestarts } = await getAdvanceSettings();
  const cutoff = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000);

  const leads = await db.lead.findMany({
    where: {
      status: { in: [...ADVANCEABLE] },
      heldByCrossSell: false,
      needsAttentionAt: null,
      updatedAt: { lt: cutoff },
    },
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: batchSize,
    select: { id: true, status: true, advanceRestarts: true },
  });

  let restarted = 0;
  let flagged = 0;
  for (const lead of leads) {
    if (lead.advanceRestarts >= maxRestarts) {
      await db.lead.update({ where: { id: lead.id }, data: { needsAttentionAt: new Date() } });
      await publish({
        name: "lead.needsAttention",
        actor: { type: "SYSTEM", job: "acquisition.lead.advance-sweeper" },
        payload: {
          leadId: lead.id,
          reason: `stuck in ${lead.status} after ${String(lead.advanceRestarts)} restarts`,
          restarts: lead.advanceRestarts,
        },
      });
      flagged += 1;
    } else {
      await requeueAdvance(lead.id, { countRestart: true });
      restarted += 1;
    }
  }

  return {
    counts: { swept: leads.length, restarted, flagged },
    summary: `swept ${String(leads.length)}: ${String(restarted)} re-advanced, ${String(flagged)} flagged`,
  };
}
