/**
 * Sending domains, mailboxes and their stats, enrolments, messages with citations and delivery
 * events (data-model §10.7). Domains and mailboxes match on their natural keys.
 */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, remap, seedWorld, upsertRows, without } from "../lib/context";

export default defineSeeder({
  name: "outreach",
  order: 60,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const outreach = world.outreach;

    for (const domain of outreach.sendingDomains) {
      await tx.sendingDomain.upsert({
        where: { domain: domain.domain },
        create: domain,
        update: without(domain, "id"),
      });
    }
    let ids = await loadIdMap(tx, world);
    for (const row of outreach.mailboxes) {
      const mailbox = remap(row, ids);
      // An existing mailbox keeps its credential key ("outreach-mailbox:<its id>").
      await tx.mailbox.upsert({
        where: { address: mailbox.address },
        create: mailbox,
        update: without(mailbox, "id", "credentialProvider"),
      });
    }
    ids = await loadIdMap(tx, world);
    for (const row of outreach.mailboxSyncStates) {
      const state = remap(row, ids);
      await tx.mailboxSyncState.upsert({
        where: { mailboxId: state.mailboxId },
        create: state,
        update: without(state, "id", "mailboxId"),
      });
    }
    // Daily counters move with the calendar: replace the seeded ones, and never touch a real row
    // (one the app wrote) for the same mailbox and day.
    await tx.mailboxDailyStat.deleteMany({ where: { id: { startsWith: "cseedmdst" } } });
    for (const row of outreach.mailboxDailyStats) {
      const stat = remap(row, ids);
      const taken = await tx.mailboxDailyStat.findUnique({
        where: { mailboxId_day: { mailboxId: stat.mailboxId, day: stat.day } },
        select: { id: true },
      });
      if (taken === null) await tx.mailboxDailyStat.create({ data: stat });
    }

    await upsertRows(outreach.enrollments, ids, (args) => tx.enrollment.upsert(args));
    await upsertRows(outreach.messages, ids, (args) => tx.message.upsert(args));
    await upsertRows(outreach.citations, ids, (args) => tx.messageCitation.upsert(args));
    await upsertRows(outreach.trackingEvents, ids, (args) => tx.trackingEvent.upsert(args));
    ctx.log(
      `${String(outreach.mailboxes.length)} mailboxes, ${String(outreach.enrollments.length)} enrolments, ${String(outreach.messages.length)} messages`,
    );
  },
});
