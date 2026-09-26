import "server-only";

import type { Lead, LeadEvent, Prisma, Tx } from "@/platform/db";

/** The lead-state queries (transitionLead). Callers pass the transaction they run in. */

export function findLead(tx: Tx, leadId: string): Promise<Lead | null> {
  return tx.lead.findUnique({ where: { id: leadId } });
}

/**
 * Updates a lead only while it's still in `from` (optimistic concurrency): a lead another request
 * moved first no longer matches, and Prisma reports P2025, which the caller maps to CONFLICT.
 */
export function updateLeadFromStatus(
  tx: Tx,
  leadId: string,
  from: Lead["status"],
  data: Prisma.LeadUncheckedUpdateInput,
): Promise<Lead> {
  return tx.lead.update({ where: { id: leadId, status: from }, data });
}

export function insertLeadEvent(
  tx: Tx,
  data: Prisma.LeadEventUncheckedCreateInput,
): Promise<LeadEvent> {
  return tx.leadEvent.create({ data });
}
