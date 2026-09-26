/**
 * Leads with their status trails, score reviews, the cross-sell group, line capacity, saved
 * searches, search runs and signals (data-model §10.2, §10.5, §10.6).
 */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, seedWorld, upsertRows, without } from "../lib/context";
import { writeFiles } from "../lib/files";

export default defineSeeder({
  name: "leads",
  order: 40,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const { search, leads } = world;

    await writeFiles(tx, search.files, ids);
    // A saved search and its last run point at each other: searches, runs, then the link.
    await upsertRows(search.savedSearches, ids, (args) => tx.savedSearch.upsert(args));
    await upsertRows(search.searchRuns, ids, (args) => tx.searchRun.upsert(args));
    for (const link of search.savedSearchLastRuns) {
      await tx.savedSearch.update({
        where: { id: link.savedSearchId },
        data: { lastRunId: link.lastRunId, lastRunAt: link.lastRunAt },
      });
    }

    // Leads and their cross-sell group point at each other too.
    await upsertRows(leads.leads, ids, (args) => tx.lead.upsert(args));
    await upsertRows(leads.crossSellGroups, ids, (args) => tx.crossSellGroup.upsert(args));
    for (const link of leads.crossSellLinks) {
      await tx.lead.update({
        where: { id: link.leadId },
        data: { crossSellGroupId: link.crossSellGroupId },
      });
    }
    await upsertRows(leads.leadEvents, ids, (args) => tx.leadEvent.upsert(args));
    await upsertRows(leads.scoreReviews, ids, (args) => tx.scoreReview.upsert(args));
    await upsertRows(search.signals, ids, (args) => tx.signal.upsert(args));
    for (const state of leads.capacityStates) {
      await tx.lineCapacityState.upsert({
        where: { serviceLine: state.serviceLine },
        create: state,
        update: without(state, "id", "serviceLine"),
      });
    }
    ctx.log(
      `${String(leads.leads.length)} leads, ${String(leads.leadEvents.length)} lead events, ${String(search.searchRuns.length)} search runs, ${String(search.signals.length)} signals`,
    );
  },
});
