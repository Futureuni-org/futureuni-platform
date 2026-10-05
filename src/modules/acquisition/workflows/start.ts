import "server-only";

/**
 * Starting and re-queuing the lead-advance workflow (Phase 19).
 *
 * `tryStartAdvance` is the fresh-start path (the `lead.created` subscriber, a manual re-queue): it
 * honours the per-line and global concurrency caps so one big search can't starve other lines or
 * burn provider quota; when capped it defers (the sweeper retries later). `requeueAdvance` bumps the
 * lead's `advanceVersion` so a deliberate restart is a new run (new idempotency key), and is the
 * sweeper's recovery path for a stuck lead — it bypasses the caps because a stuck lead is already
 * counted in the in-flight total.
 */

import type { Actor } from "@/contracts/common";
import { db } from "@/platform/db";
import { enqueueJob } from "@/platform/jobs";

import { ADVANCE_JOB_NAME } from "./lead-advance.job";
import { getAdvanceSettings } from "./settings";

/** Pre-contact statuses the advance workflow can act on. */
const ADVANCEABLE = new Set(["NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED", "SCORED"]);
/** Transient statuses that count as a lead "in flight" through enrich/audit. */
const IN_FLIGHT = ["ENRICHING", "AUDITING"] as const;

function systemActor(): Actor {
  return { type: "SYSTEM", job: ADVANCE_JOB_NAME };
}

/**
 * The actor the advance run itself acts as. A USER re-queue keeps the user (authorized by role); a
 * SYSTEM caller (subscriber, sweeper) is replaced by the advance job's own SYSTEM actor, so the
 * run's `systemActions` are looked up under `acquisition.lead.advance`, not the caller's job.
 */
function advanceActor(caller: Actor | undefined): Actor {
  return caller?.type === "USER" ? caller : systemActor();
}

export interface StartAdvanceResult {
  started: boolean;
  reason?: "missing" | "not-advanceable" | "global-cap" | "line-cap";
}

/**
 * Start a lead's advance under the concurrency caps. Idempotent on `(leadId, advanceVersion)`, so a
 * duplicate `lead.created` collapses to one run. Returns whether it was enqueued.
 */
export async function tryStartAdvance(
  leadId: string,
  opts: { actor?: Actor } = {},
): Promise<StartAdvanceResult> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true, serviceLine: true, advanceVersion: true },
  });
  if (lead === null) return { started: false, reason: "missing" };
  if (!ADVANCEABLE.has(lead.status)) return { started: false, reason: "not-advanceable" };

  const settings = await getAdvanceSettings();
  const [globalInFlight, lineInFlight] = await Promise.all([
    db.lead.count({ where: { status: { in: [...IN_FLIGHT] } } }),
    db.lead.count({ where: { status: { in: [...IN_FLIGHT] }, serviceLine: lead.serviceLine } }),
  ]);
  if (globalInFlight >= settings.maxConcurrentGlobal) return { started: false, reason: "global-cap" };
  if (lineInFlight >= settings.maxConcurrentPerLine) return { started: false, reason: "line-cap" };

  await enqueueJob(
    ADVANCE_JOB_NAME,
    { leadId, advanceVersion: lead.advanceVersion },
    { actor: advanceActor(opts.actor) },
  );
  return { started: true };
}

/**
 * Re-queue a lead's advance as a fresh run: bump `advanceVersion` (and, for sweeper restarts,
 * `advanceRestarts`) and enqueue. Caps are not applied — this is a recovery path for a lead that is
 * already in the pipeline. Returns false only when the lead is gone or not advanceable.
 */
export async function requeueAdvance(
  leadId: string,
  opts: { actor?: Actor; countRestart?: boolean } = {},
): Promise<{ started: boolean }> {
  const current = await db.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (current === null || !ADVANCEABLE.has(current.status)) return { started: false };

  const lead = await db.lead.update({
    where: { id: leadId },
    data: {
      advanceVersion: { increment: 1 },
      ...(opts.countRestart === true ? { advanceRestarts: { increment: 1 } } : {}),
    },
    select: { advanceVersion: true },
  });
  await enqueueJob(
    ADVANCE_JOB_NAME,
    { leadId, advanceVersion: lead.advanceVersion },
    { actor: advanceActor(opts.actor) },
  );
  return { started: true };
}
