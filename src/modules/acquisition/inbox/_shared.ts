import "server-only";

/**
 * Helpers shared across the inbox area (Phase 13). `publishStatusChanged` turns a `transitionLead`
 * result into the `lead.statusChanged` domain event, published after commit in the same transaction
 * (events contract rule 1). `notifySafe` keeps a failed or (pre-integration) unregistered
 * notification type from failing the reply processing that triggered it (events contract rule 3).
 */

import type { Actor, Market, ServiceLine } from "@/contracts/common";
import type { LeadEvent, Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { makeLogger } from "@/platform/jobs";
import { notify, type NotifyInput } from "@/platform/notifications";

/** Shared PII-free logger for the inbox area (IDs only; project-rules logging rules). */
export const inboxLog = makeLogger("inbox", "acquisition.inbox");

export async function notifySafe(input: NotifyInput): Promise<void> {
  try {
    await notify(input);
  } catch (error) {
    inboxLog.warn("notification skipped", {
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
