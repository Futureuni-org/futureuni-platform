/**
 * Suppressions, the consent record and data-subject requests (data-model §10.7). Suppressions
 * match on their live (type, value); the DSR deletion's row holds only the keyed hash, computed
 * with the same function the product uses.
 */

import { hashSuppressionValue, normalizeSuppressionValue } from "@/modules/acquisition/core";
import { defineSeeder } from "@/platform/db";

import { loadIdMap, remap, seedWorld, upsertRows } from "../lib/context";

export default defineSeeder({
  name: "compliance",
  order: 80,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const compliance = world.compliance;

    for (const row of compliance.suppressions) {
      const { hashValueOf, ...rest } = remap(row, ids);
      const normalized = normalizeSuppressionValue(rest.type, hashValueOf ?? rest.value);
      if (normalized === null)
        throw new Error(`Seed suppression ${rest.id} has a value that doesn't normalise.`);
      const suppression = {
        ...rest,
        value: hashValueOf === undefined ? normalized : hashSuppressionValue(normalized),
      };
      const existing = await tx.suppression.findFirst({
        where: { type: suppression.type, value: suppression.value, removedAt: null },
        select: { id: true },
      });
      const { id, ...fields } = suppression;
      if (existing !== null && existing.id !== id)
        await tx.suppression.update({ where: { id: existing.id }, data: fields });
      else await tx.suppression.upsert({ where: { id }, create: suppression, update: fields });
    }
    await upsertRows(compliance.consentRecords, ids, (args) => tx.consentRecord.upsert(args));
    const requests = compliance.dataSubjectRequests.map(({ hashSubjectEmailOf, ...request }) => {
      if (hashSubjectEmailOf === undefined) return request;
      const normalized = normalizeSuppressionValue("EMAIL", hashSubjectEmailOf);
      if (normalized === null) throw new Error(`Seed request ${request.id} has an invalid email.`);
      return { ...request, subjectEmail: hashSuppressionValue(normalized) };
    });
    await upsertRows(requests, ids, (args) => tx.dataSubjectRequest.upsert(args));
    ctx.log(
      `${String(compliance.suppressions.length)} suppressions, ${String(compliance.consentRecords.length)} consent record, ${String(compliance.dataSubjectRequests.length)} data-subject requests`,
    );
  },
});
