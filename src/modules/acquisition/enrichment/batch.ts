/**
 * Batch helpers for the enrichment jobs (Phase 9). Each helper enqueues per-lead work through
 * `enqueueJob("acquisition.enrichment.lead", …)`; the platform's Vercel Workflow runtime owns
 * the retries and step-level durability.
 */

import "server-only";

import type { JobResult } from "@/contracts/jobs";
import { db } from "@/platform/db";
import { enqueueJob } from "@/platform/jobs";

export async function enqueueBatch(batchSize: number): Promise<JobResult> {
  const leads = await db.lead.findMany({
    where: { status: "NEW" },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    select: { id: true },
  });
  for (const lead of leads) {
    await enqueueJob(
      "acquisition.enrichment.lead",
      { leadId: lead.id },
      { actor: { type: "SYSTEM", job: "acquisition.enrichment.batch" } },
    );
  }
  return { counts: { picked: leads.length } };
}

export async function refreshStaleLeads(olderThanDays: number): Promise<JobResult> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const leads = await db.lead.findMany({
    where: {
      status: { in: ["ENRICHED", "AUDITED", "SCORED"] },
      updatedAt: { lt: cutoff },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
    select: { id: true },
  });
  for (const lead of leads) {
    await enqueueJob(
      "acquisition.enrichment.lead",
      { leadId: lead.id },
      { actor: { type: "SYSTEM", job: "acquisition.enrichment.refresh" } },
    );
  }
  return { counts: { queued: leads.length } };
}
