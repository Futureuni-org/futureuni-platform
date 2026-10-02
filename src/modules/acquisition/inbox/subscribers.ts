/**
 * Inbox event subscribers (Phase 13). Routes `reply.classified` to the owner's notification:
 * `reply.interested` (critical) for an interested reply, `reply.needs-action` for a question,
 * objection, unclear message or low-confidence classification (events.md §3a). A dedupe key per
 * reply keeps it from firing twice even if another router also maps the event. Registered on the
 * acquisition manifest by Phase 19 through `phases/13/REQUESTS.md`.
 */

import type { AnySubscriberDefinition } from "@/contracts/events";
import { defineSubscriber } from "@/platform/registry/define";

const NEEDS_ACTION = new Set(["QUESTION", "OBJECTION_PRICE", "OBJECTION_OTHER", "OTHER"]);
const LOW_CONFIDENCE = 0.5;

export const replyClassifiedSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.inbox.notify-on-classified",
  events: ["reply.classified"],
  mode: "job",
  handler: async (event) => {
    const { leadId, classification, confidence, replyId } = event.payload;
    if (leadId === null) return;

    const isInterested = classification === "INTERESTED";
    const needsAction = NEEDS_ACTION.has(classification) || (confidence < LOW_CONFIDENCE && classification !== "INTERESTED");
    if (!isInterested && !needsAction) return;

    const { db } = await import("@/platform/db");
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true, serviceLine: true } });
    if (lead === null) return;

    let recipients: string[] = lead.ownerId === null ? [] : [lead.ownerId];
    if (recipients.length === 0) {
      const { getLineOwners } = await import("@/modules/acquisition/profiles");
      recipients = (await getLineOwners(lead.serviceLine)).map((o) => o.id);
    }
    if (recipients.length === 0) return;

    const { notify } = await import("@/platform/notifications");
    if (isInterested) {
      await notify({
        userIds: recipients,
        type: "reply.interested",
        title: "Interested reply",
        body: "A prospect replied with interest.",
        data: { leadId, serviceLine: lead.serviceLine },
        dedupeKey: `reply.interested:${replyId}`,
      });
    } else {
      await notify({
        userIds: recipients,
        type: "reply.needs-action",
        title: "Reply needs action",
        body: "A prospect reply needs a human response.",
        data: { leadId, serviceLine: lead.serviceLine },
        dedupeKey: `reply.needs-action:${replyId}`,
      });
    }
  },
});

export const inboxSubscribers: readonly AnySubscriberDefinition[] = [replyClassifiedSubscriber];
