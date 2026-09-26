/** The 64 companies with their contacts, source refs and notes (data-model §10.4). */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, remap, seedWorld, upsertRows, without } from "../lib/context";

export default defineSeeder({
  name: "directory",
  order: 30,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const { companies, contacts, sourceRefs, notes } = world.directory;

    // Companies match on their live domain first; a company already holding a seeded domain is
    // updated in place and keeps its id.
    for (const company of companies) {
      const existing =
        company.normalizedDomain == null
          ? null
          : await tx.company.findFirst({
              where: { normalizedDomain: company.normalizedDomain },
              select: { id: true },
            });
      const { id, ...fields } = company;
      if (existing !== null && existing.id !== id)
        await tx.company.update({ where: { id: existing.id }, data: fields });
      else await tx.company.upsert({ where: { id }, create: company, update: fields });
    }

    const ids = await loadIdMap(tx, world);
    await upsertRows(contacts, ids, (args) => tx.contact.upsert(args));
    for (const row of sourceRefs) {
      const ref = remap(row, ids);
      await tx.companySourceRef.upsert({
        where: { adapterId_externalId: { adapterId: ref.adapterId, externalId: ref.externalId } },
        create: ref,
        update: without(ref, "id", "adapterId", "externalId"),
      });
    }
    await upsertRows(notes, ids, (args) => tx.note.upsert(args));
    ctx.log(
      `${String(companies.length)} companies, ${String(contacts.length)} contacts, ${String(sourceRefs.length)} source refs`,
    );
  },
});
