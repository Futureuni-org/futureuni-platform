import "server-only";

/**
 * Database access for capacity throttling: counting today's approved first touches (shared Message
 * rows, owned by Phase 12), reading and persisting the per-line capacity mode, and listing
 * capacity-held nurture leads for release.
 */

import type { CapacityMode, ServiceLine } from "@/contracts/common";
import { db, type LineCapacityState, type Tx } from "@/platform/db";

/**
 * Approved first touches today for a line (the Africa/Lagos day), whether sent or still scheduled
 * (module spec §3.10). A first touch is step 0 of a sequence; rejected and cancelled drafts don't
 * count. Message is shared data (Phase 12 owns writes); we only read it.
 */
export async function countFirstTouchesToday(
  serviceLine: ServiceLine,
  range: { start: Date; end: Date },
): Promise<number> {
  return db.message.count({
    where: {
      lead: { serviceLine },
      kind: "SEQUENCE",
      stepIndex: 0,
      approvedAt: { gte: range.start, lt: range.end },
      status: { notIn: ["REJECTED", "CANCELLED"] },
    },
  });
}

export async function getLineCapacityState(serviceLine: ServiceLine): Promise<LineCapacityState | null> {
  return db.lineCapacityState.findUnique({ where: { serviceLine } });
}

/** Upserts the stored mode for a line, stamping `since` when the mode actually changes. */
export async function setLineCapacityMode(
  tx: Tx,
  serviceLine: ServiceLine,
  mode: CapacityMode,
  now: Date,
): Promise<void> {
  await tx.lineCapacityState.upsert({
    where: { serviceLine },
    create: { serviceLine, mode, since: now },
    update: { mode, since: now },
  });
}

/** Capacity-held nurture leads for a line, highest score first (the release order, AC-18.4). */
export async function findCapacityHeldLeads(
  serviceLine: ServiceLine,
  limit: number,
): Promise<{ id: string; score: number | null }[]> {
  return db.lead.findMany({
    where: { serviceLine, status: "NURTURE", nurtureReason: "CAPACITY" },
    orderBy: [{ score: "desc" }, { scoredAt: "asc" }],
    take: limit,
    select: { id: true, score: true },
  });
}

/** Every line that currently has a stored capacity state (for the refresh sweep). */
export async function listLineCapacityStates(): Promise<LineCapacityState[]> {
  return db.lineCapacityState.findMany();
}
