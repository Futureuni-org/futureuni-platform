/**
 * Meetings, proposals (with their emails and PDFs), deals, handoffs and assignments (data-model
 * §10.8). It ends by recomputing every team member's currentLoad from the active assignments,
 * the same rule recalculateLoad applies, so the §10.2 loads and line capacity hold.
 */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, seedWorld, upsertRows } from "../lib/context";
import { writeFiles } from "../lib/files";

export default defineSeeder({
  name: "pipeline",
  order: 90,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const pipeline = world.pipeline;

    await writeFiles(tx, pipeline.files, ids);
    await upsertRows(pipeline.meetings, ids, (args) => tx.meeting.upsert(args));
    // Proposals point at the email that sent them.
    await upsertRows(pipeline.proposalMessages, ids, (args) => tx.message.upsert(args));
    await upsertRows(pipeline.proposalCitations, ids, (args) => tx.messageCitation.upsert(args));
    await upsertRows(pipeline.proposalAttachments, ids, (args) =>
      tx.messageAttachment.upsert(args),
    );
    await upsertRows(pipeline.proposals, ids, (args) => tx.proposal.upsert(args));
    await upsertRows(pipeline.proposalLineItems, ids, (args) => tx.proposalLineItem.upsert(args));
    await upsertRows(pipeline.deals, ids, (args) => tx.deal.upsert(args));
    await upsertRows(pipeline.handoffs, ids, (args) => tx.handoff.upsert(args));
    await upsertRows(pipeline.handoffAssignments, ids, (args) => tx.handoffAssignment.upsert(args));

    // currentLoad = the person's active handoff assignments (never seeded directly).
    const loads = await tx.handoffAssignment.groupBy({
      by: ["assignedUserId"],
      where: { active: true, assignedUserId: { not: null } },
      _count: { _all: true },
    });
    const profiles = await tx.teamProfile.findMany({ select: { userId: true } });
    for (const profile of profiles) {
      const load = loads.find((row) => row.assignedUserId === profile.userId)?._count._all ?? 0;
      await tx.teamProfile.update({
        where: { userId: profile.userId },
        data: { currentLoad: load },
      });
    }
    ctx.log(
      `${String(pipeline.meetings.length)} meetings, ${String(pipeline.proposals.length)} proposals, ${String(pipeline.deals.length)} deals, ${String(pipeline.handoffs.length)} handoffs`,
    );
  },
});
