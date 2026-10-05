/**
 * Notification router (Phase 6). Maps a domain event to `notify()` calls, using the
 * notification-type registry in `docs/contracts/events.md` §3a.
 *
 * Recipient resolution is deliberately conservative — only the roles/lines every FUTUREUNI phase
 * has agreed on. Later phases (13 inbox, 14 pipeline, 17 analytics) add or refine mappings.
 */

import "server-only";

import type { DomainEvent } from "@/contracts/events";
import { db } from "@/platform/db";

import { notify } from "./notify";

export async function routeEventToNotifications(event: DomainEvent): Promise<void> {
  switch (event.name) {
    case "reply.classified":
      await routeReplyClassified(event);
      break;
    case "meeting.booked":
      await routeMeetingBooked(event);
      break;
    case "deal.won":
      await routeDealClosed(event, "deal.won");
      break;
    case "deal.lost":
      await routeDealClosed(event, "deal.lost");
      break;
    case "capacity.mode.changed":
      await routeCapacity(event);
      break;
    case "lead.needsAttention":
      await routeNeedsAttention(event);
      break;
    case "job.failed":
      await notify({ role: "ADMIN", type: "job.failed", title: `Job failed: ${event.payload.name}`, body: event.payload.errorSummary, dedupeKey: `job.failed:${event.payload.jobRunId}` });
      break;
    case "integration.failing":
      await notify({ role: "ADMIN", type: "integration.failing", title: `Integration failing: ${event.payload.provider}`, body: event.payload.error, dedupeKey: `integration.failing:${event.payload.provider}` });
      break;
    case "ai.budget.warning":
      await notify({ role: "ADMIN", type: "ai.budget-warning", title: `AI budget 80%: ${event.payload.scope}`, dedupeKey: `ai.budget.warning:${event.payload.scope}:${String(event.payload.percent)}` });
      break;
    case "ai.budget.exceeded":
      await notify({ role: "ADMIN", type: "ai.budget-exceeded", title: `AI budget reached: ${event.payload.scope}`, dedupeKey: `ai.budget.exceeded:${event.payload.scope}` });
      break;
    case "user.roleChanged":
      await notify({ userIds: [event.payload.userId], type: "security.role-changed", title: "Your role changed", body: `From ${event.payload.from} to ${event.payload.to}.`, dedupeKey: `role-changed:${event.payload.userId}:${event.payload.to}` });
      break;
    case "user.twoFactorReset":
      await notify({ userIds: [event.payload.userId], type: "security.2fa-reset", title: "Two-factor authentication was reset", dedupeKey: `2fa-reset:${event.payload.userId}:${event.id}` });
      break;
    default:
      // No mapping yet.
      break;
  }
}

async function routeReplyClassified(event: Extract<DomainEvent, { name: "reply.classified" }>): Promise<void> {
  const leadId = event.payload.leadId;
  if (leadId === null) return;
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
  if (lead?.ownerId === null || lead === null) return;
  if (event.payload.classification === "INTERESTED") {
    await notify({
      userIds: [lead.ownerId],
      type: "reply.interested",
      title: "A prospect is interested",
      link: `/acquisition/leads/${leadId}`,
      dedupeKey: `reply.interested:${event.payload.replyId}`,
    });
  } else {
    await notify({
      userIds: [lead.ownerId],
      type: "reply.needs-action",
      title: "A reply needs action",
      link: `/acquisition/leads/${leadId}`,
      dedupeKey: `reply.needs-action:${event.payload.replyId}`,
    });
  }
}

async function routeMeetingBooked(event: Extract<DomainEvent, { name: "meeting.booked" }>): Promise<void> {
  if (event.payload.ownerId === null) return;
  await notify({
    userIds: [event.payload.ownerId],
    type: "meeting.booked",
    title: "New meeting booked",
    dedupeKey: `meeting.booked:${event.payload.meetingId}`,
  });
}

async function routeDealClosed(
  event: Extract<DomainEvent, { name: "deal.won" | "deal.lost" }>,
  type: "deal.won" | "deal.lost",
): Promise<void> {
  const lead = await db.lead.findUnique({
    where: { id: event.payload.leadId },
    select: { ownerId: true, serviceLine: true },
  });
  const title = type === "deal.won" ? "Deal won" : "Deal lost";
  // The owner and every manager (managers work across all lines).
  await notify({
    ...(lead?.ownerId == null ? {} : { userIds: [lead.ownerId] }),
    role: "MANAGER",
    type,
    title,
    dedupeKey: `${type}:${event.payload.dealId}`,
  });
  // The line's service leads too (CR-14-07).
  if (lead != null) {
    await notify({
      serviceLine: lead.serviceLine,
      role: "SERVICE_LEAD",
      type,
      title,
      dedupeKey: `${type}:${event.payload.dealId}:lead`,
    });
  }
}

async function routeNeedsAttention(
  event: Extract<DomainEvent, { name: "lead.needsAttention" }>,
): Promise<void> {
  const lead = await db.lead.findUnique({
    where: { id: event.payload.leadId },
    select: { serviceLine: true, ownerId: true },
  });
  if (lead === null) return;
  const key = `lead.needs-attention:${event.payload.leadId}:${String(event.payload.restarts)}`;
  const link = `/acquisition/leads/${event.payload.leadId}`;
  // The owner and the line's service leads.
  await notify({
    ...(lead.ownerId === null ? {} : { userIds: [lead.ownerId] }),
    serviceLine: lead.serviceLine,
    role: "SERVICE_LEAD",
    type: "lead.needs-attention",
    title: "A lead needs attention",
    body: event.payload.reason,
    link,
    dedupeKey: key,
  });
  // Admins (any line).
  await notify({
    role: "ADMIN",
    type: "lead.needs-attention",
    title: "A lead needs attention",
    body: event.payload.reason,
    link,
    dedupeKey: `${key}:admin`,
  });
}

async function routeCapacity(event: Extract<DomainEvent, { name: "capacity.mode.changed" }>): Promise<void> {
  if (event.payload.to !== "SLOW" && event.payload.to !== "PAUSED") return;
  await notify({
    serviceLine: event.payload.serviceLine,
    role: "MANAGER",
    type: "capacity.line-full",
    title: `Line at capacity: ${event.payload.serviceLine}`,
    dedupeKey: `capacity:${event.payload.serviceLine}:${event.payload.to}`,
  });
}
