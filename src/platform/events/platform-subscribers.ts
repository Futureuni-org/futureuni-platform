/**
 * Platform-owned subscribers (Phase 6).
 *
 * - `notification-router` maps every event in `docs/contracts/events.md` §3a to `notify()` calls.
 * - `audit-bridge` writes audit entries for events that describe an important mutation but weren't
 *   audited at source (for example `lead.statusChanged` from module code).
 */

import "server-only";

import type { AnySubscriberDefinition, DomainEventName } from "@/contracts/events";
import { defineSubscriber } from "@/platform/registry/define";

// Notification-router: driven off the notification-type registry in events.md §3a.
export const notificationRouter: AnySubscriberDefinition = defineSubscriber({
  id: "platform.notification-router",
  events: [
    "reply.classified",
    "meeting.booked",
    "deal.won",
    "deal.lost",
    "capacity.mode.changed",
    "job.failed",
    "integration.failing",
    "ai.budget.warning",
    "ai.budget.exceeded",
    "user.roleChanged",
    "user.twoFactorReset",
    "sourcing.run.completed",
    "crosssell.detected",
    "mailbox.paused",
    "handoff.created",
    "lead.assigned",
    "lead.needsAttention",
    "compliance.dsr.completed",
    "message.drafted",
  ] as const satisfies readonly DomainEventName[],
  mode: "job",
  handler: async (event) => {
    // Real notification fan-out is wired at merge (SEAM-NOTIFICATIONS-SHELL not needed here);
    // for now, one call per event maps event → notification type via `routeEventToNotifications`.
    const { routeEventToNotifications } = await import("@/platform/notifications/router");
    await routeEventToNotifications(event);
  },
});

// Audit-bridge: records mutations that pass through publish() without being audited at source.
export const auditBridge: AnySubscriberDefinition = defineSubscriber({
  id: "platform.audit-bridge",
  events: [
    "lead.statusChanged",
    "user.deactivated",
    "user.roleChanged",
    "user.twoFactorReset",
    "profile.published",
  ] as const satisfies readonly DomainEventName[],
  mode: "inline",
  handler: async (event) => {
    const { audit } = await import("@/platform/audit-log");
    await audit.record(null, {
      actor: event.actor,
      action: `bridge.${event.name}`,
      targetType: bridgeTargetType(event.name),
      targetId: bridgeTargetId(event),
      after: event.payload,
    });
  },
});

function bridgeTargetType(name: DomainEventName): string {
  if (name.startsWith("lead.")) return "Lead";
  if (name.startsWith("user.")) return "User";
  if (name === "profile.published") return "ServiceLineProfile";
  return "DomainEvent";
}

function bridgeTargetId(event: { payload: unknown }): string {
  const payload = event.payload as Record<string, unknown>;
  return (
    (payload.leadId as string | undefined) ??
    (payload.userId as string | undefined) ??
    (payload.serviceLine as string | undefined) ??
    "(unknown)"
  );
}

export const platformSubscribers: readonly AnySubscriberDefinition[] = [notificationRouter, auditBridge];
