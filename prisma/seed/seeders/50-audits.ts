/** Audits, check runs, findings, cache entries and screenshot files (data-model §10.6). */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, remap, seedWorld, upsertRows, without } from "../lib/context";
import { writeFiles } from "../lib/files";

export default defineSeeder({
  name: "audits",
  order: 50,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const { audits, checkRuns, findings, cacheEntries, files } = world.audits;

    await writeFiles(tx, files, ids);
    await upsertRows(audits, ids, (args) => tx.audit.upsert(args));
    await upsertRows(checkRuns, ids, (args) => tx.auditCheckRun.upsert(args));
    await upsertRows(findings, ids, (args) => tx.auditFinding.upsert(args));
    // The cache is keyed by domain and check, which real audits of seeded companies reuse.
    for (const row of cacheEntries) {
      const entry = remap(row, ids);
      await tx.auditCacheEntry.upsert({
        where: { cacheKey: entry.cacheKey },
        create: entry,
        update: without(entry, "id", "cacheKey"),
      });
    }
    ctx.log(
      `${String(audits.length)} audits, ${String(findings.length)} findings, ${String(files.length)} screenshots`,
    );
  },
});
