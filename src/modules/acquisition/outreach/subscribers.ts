/**
 * Outreach event subscribers (Phase 12). Routes `mailbox.paused` to admins and `message.drafted`
 * to the lead owner's review queue. Registered on the acquisition manifest by Phase 19 through
 * `phases/12/REQUESTS.md`.
 */

import type { AnySubscriberDefinition } from "@/contracts/events";
import { defineSubscriber } from "@/platform/registry/define";

export const mailboxPausedSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.outreach.mailbox-paused",
  events: ["mailbox.paused"],
  mode: "job",
  handler: async (event) => {
    const { notify } = await import("@/platform/notifications");
    await notify({
      role: "ADMIN",
      type: "mailbox.paused",
      title: "Outreach mailbox paused",
      body: `A mailbox was paused: ${event.payload.reason}.`,
      data: { mailboxId: event.payload.mailboxId },
      dedupeKey: `mailbox.paused:${event.payload.mailboxId}`,
    });
  },
});

export const reviewQueueSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.outreach.review-waiting",
  events: ["message.drafted"],
  mode: "job",
  handler: async (event) => {
    const { db } = await import("@/platform/db");
    const lead = await db.lead.findUnique({ where: { id: event.payload.leadId }, select: { ownerId: true } });
    if (lead?.ownerId == null) return;
    const { notify } = await import("@/platform/notifications");
    await notify({
      userIds: [lead.ownerId],
      type: "review.queue-waiting",
      title: "A draft is waiting for review",
      link: `/acquisition`,
      data: { messageId: event.payload.messageId, leadId: event.payload.leadId },
      dedupeKey: `review.queue-waiting:${event.payload.messageId}`,
    });
  },
});

export const outreachSubscribers: readonly AnySubscriberDefinition[] = [
  mailboxPausedSubscriber,
  reviewQueueSubscriber,
];
