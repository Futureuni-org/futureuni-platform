/**
 * Platform rows (data-model §10.9): settings, the active prompt version, AI calls, job runs,
 * notifications, audit log entries and 14 days of provider usage. It runs before the module
 * seeders because search runs and audits point at its job runs.
 */

import { defineSeeder } from "@/platform/db";

import { loadIdMap, remap, seedWorld, upsertRows } from "../lib/context";

export default defineSeeder({
  name: "platform",
  order: 15,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    const ids = await loadIdMap(tx, world);
    const platform = world.platform;

    // Settings: one row per (key, scope) for PLATFORM and MODULE scope.
    for (const row of platform.settings) {
      const setting = remap(row, ids);
      const existing = await tx.setting.findFirst({
        where: { key: setting.key, scope: setting.scope, userId: null },
        select: { id: true },
      });
      if (existing === null) await tx.setting.create({ data: setting });
      else
        await tx.setting.update({
          where: { id: existing.id },
          data: { value: setting.value, module: setting.module ?? null },
        });
    }

    // Prompt versions: only while nothing else was published for the task (Phase 5 publishes the rest).
    for (const row of platform.promptVersions) {
      const other = await tx.promptVersion.findFirst({
        where: { task: row.task, id: { not: row.id } },
        select: { id: true },
      });
      if (other === null) await upsertRows([row], ids, (args) => tx.promptVersion.upsert(args));
      else ctx.log(`kept the published ${row.task} prompt versions`);
    }

    await upsertRows(platform.aiCalls, ids, (args) => tx.aiCall.upsert(args));
    await upsertRows(platform.jobRuns, ids, (args) => tx.jobRun.upsert(args));
    await upsertRows(platform.notifications, ids, (args) => tx.notification.upsert(args));
    await upsertRows(platform.auditLogs, ids, (args) => tx.auditLog.upsert(args));

    // Daily counters move with the calendar: replace the seeded ones, and never touch a real row
    // (one the app wrote) for the same provider and day.
    await tx.providerUsage.deleteMany({ where: { id: { startsWith: "cseedpusg" } } });
    for (const row of platform.providerUsages) {
      const taken = await tx.providerUsage.findUnique({
        where: { provider_day: { provider: row.provider, day: row.day } },
        select: { id: true },
      });
      if (taken === null) await tx.providerUsage.create({ data: row });
    }
    ctx.log(
      `${String(platform.settings.length)} settings, ${String(platform.aiCalls.length)} AI calls, ${String(platform.jobRuns.length)} job runs, ` +
        `${String(platform.notifications.length)} notifications, ${String(platform.auditLogs.length)} audit entries`,
    );
  },
});
