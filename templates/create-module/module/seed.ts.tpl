/**
 * __MODULE_NAME__'s development seed. The runner (prisma/seed/index.ts) finds every
 * src/** /seed.ts, runs them by `order` in their own transactions, and only on a local database.
 * Seeders must be idempotent: find by a natural key, then update or create.
 */

import { defineSeeder } from "@/platform/db";

export default defineSeeder({
  name: "__MODULE_ID__",
  order: 200,
  async run(tx, ctx) {
    const key = "__MODULE_ID__.welcomeMessage";
    const existing = await tx.setting.findFirst({ where: { key, scope: "MODULE", userId: null } });
    const value = "Welcome to __MODULE_NAME__.";
    if (existing === null) {
      await tx.setting.create({ data: { key, scope: "MODULE", module: "__MODULE_ID__", value } });
    } else {
      await tx.setting.update({ where: { id: existing.id }, data: { value } });
    }
    ctx.log(`__MODULE_ID__: seeded ${key}`);
  },
});
