/** Batch and refresh helpers for the audit jobs. */

import "server-only";

import type { Actor } from "@/contracts/common";
import { db } from "@/platform/db";
import { enqueueJob } from "@/platform/jobs";

import { getAuditConfig } from "./config";

const BATCH_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.audits.batch" };
const REFRESH_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.audits.refresh" };

/** Enqueues per-lead audit jobs for ENRICHED leads not yet flagged for manual review. */
export async function enqueueAuditBatch(batchSize: number): Promise<{ counts: { picked: number; enqueued: number } }> {
  const config = await getAuditConfig();
  const leads = await db.lead.findMany({
    where: { status: "ENRICHED", auditFailureCount: { lt: config.maxRequiredFailures } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    select: { id: true },
  });
  let enqueued = 0;
  for (const lead of leads) {
    const res = await enqueueJob("acquisition.audits.lead", { leadId: lead.id }, { actor: BATCH_ACTOR });
    if (!res.deduplicated) enqueued += 1;
  }
  return { counts: { picked: leads.length, enqueued } };
}

/** Re-audits active leads whose latest audit is older than `olderThanDays`, before a new sequence step. */
export async function refreshStaleAudits(olderThanDays: number): Promise<{ counts: { picked: number; enqueued: number } }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const leads = await db.lead.findMany({
    where: {
      status: { in: ["CONTACTED", "REPLIED"] },
      audits: { every: { createdAt: { lt: cutoff } } },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
    select: { id: true },
  });
  let enqueued = 0;
  for (const lead of leads) {
    const res = await enqueueJob(
      "acquisition.audits.lead",
      { leadId: lead.id, force: true },
      { actor: REFRESH_ACTOR, idempotencyKey: `acquisition.audits.refresh:${lead.id}:${cutoff.toISOString().slice(0, 10)}` },
    );
    if (!res.deduplicated) enqueued += 1;
  }
  return { counts: { picked: leads.length, enqueued } };
}
