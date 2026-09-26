/** Replies, the correction, inbox threads and the answers to replies (data-model §10.7). */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, remap, seedWorld, upsertRows, without } from "../lib/context";

export default defineSeeder({
  name: "inbox",
  order: 70,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const inbox = world.inbox;

    await upsertRows(inbox.replies, ids, (args) => tx.reply.upsert(args));
    await upsertRows(inbox.replyCorrections, ids, (args) => tx.replyCorrection.upsert(args));
    for (const row of inbox.inboxThreads) {
      const thread = remap(row, ids);
      await tx.inboxThread.upsert({
        where: { leadId: thread.leadId },
        create: thread,
        update: without(thread, "id", "leadId"),
      });
    }
    // Answers point at the replies they answer, so they come after them.
    await upsertRows(inbox.answers, ids, (args) => tx.message.upsert(args));
    await upsertRows(inbox.answerCitations, ids, (args) => tx.messageCitation.upsert(args));
    await upsertRows(inbox.answerTracking, ids, (args) => tx.trackingEvent.upsert(args));
    ctx.log(
      `${String(inbox.replies.length)} replies, ${String(inbox.inboxThreads.length)} threads`,
    );
  },
});
