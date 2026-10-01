/**
 * Helpers shared across the pipeline services. `publishStatusChanged` turns a `transitionLead`
 * result into the `lead.statusChanged` domain event, published after commit in the same transaction
 * (events contract rule 1). The caller already wrote the `LeadEvent` via `transitionLead`.
 */

import "server-only";

import type { Actor, Market, ServiceLine } from "@/contracts/common";
import type { LeadEvent, Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { makeLogger } from "@/platform/jobs";
import { notify, type NotifyInput } from "@/platform/notifications";

/** Shared PII-free logger for the pipeline area (IDs only; project-rules logging rules). */
export const pipelineLog = makeLogger("pipeline", "acquisition.pipeline");
const log = pipelineLog;

/**
 * Sends a notification best-effort: a failed or (pre-integration) unregistered notification type
 * never fails the business mutation that triggered it (events contract rule 3). Phase 19 registers
 * the pipeline notification types on the manifest; until then module-owned types are unknown here.
 */
export async function notifySafe(input: NotifyInput): Promise<void> {
  try {
    await notify(input);
  } catch (error) {
    log.warn("notification skipped", {
      type: input.type,
      error: error instanceof Error ? error.message : "error",
    });
  }
}

export async function publishStatusChanged(
  tx: Tx,
  actor: Actor,
  event: LeadEvent | null,
  scope: { leadId: string; serviceLine: ServiceLine; market: Market },
  reason?: string,
): Promise<void> {
  // Not a transition (already in target status), or a creation row — nothing to publish here.
  if (event === null) return;
  if (event.toStatus === null) return;
  await publishAfterCommit(tx, {
    name: "lead.statusChanged",
    actor,
    payload: {
      leadId: scope.leadId,
      leadEventId: event.id,
      from: event.fromStatus,
      to: event.toStatus,
      serviceLine: scope.serviceLine,
      market: scope.market,
      ...(reason === undefined ? {} : { reason }),
    },
  });
}
