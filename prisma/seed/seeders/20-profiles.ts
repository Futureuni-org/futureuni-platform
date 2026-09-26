/**
 * One placeholder profile version per line ("seed:placeholder") and the 8 materialised sequences
 * (data-model §10.3). A line whose profile was published by anyone else (Phase 7's seeder, or a
 * person) is left alone, so re-seeding never reactivates the placeholder over a real profile.
 */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, seedWorld, upsertRows } from "../lib/context";

export default defineSeeder({
  name: "profiles",
  order: 20,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const { profileVersions, sequences, sequenceSteps } = world.profiles;

    for (const version of profileVersions) {
      const other = await tx.serviceLineProfileVersion.findFirst({
        where: { serviceLine: version.serviceLine, id: { not: version.id } },
        select: { id: true },
      });
      if (other === null)
        await upsertRows([version], ids, (args) => tx.serviceLineProfileVersion.upsert(args));
      else ctx.log(`kept the ${version.serviceLine} profile versions already published`);
    }
    // Sequences point at the placeholder version, which always exists once seeded.
    const placeholderIds = new Set(
      (
        await tx.serviceLineProfileVersion.findMany({
          where: { id: { in: profileVersions.map((version) => version.id) } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    const kept = sequences.filter((sequence) => placeholderIds.has(sequence.profileVersionId));
    await upsertRows(kept, ids, (args) => tx.sequence.upsert(args));
    const keptIds = new Set(kept.map((sequence) => sequence.id));
    await upsertRows(
      sequenceSteps.filter((step) => keptIds.has(step.sequenceId)),
      ids,
      (args) => tx.sequenceStep.upsert(args),
    );
    ctx.log(`${String(profileVersions.length)} profile versions, ${String(kept.length)} sequences`);
  },
});
