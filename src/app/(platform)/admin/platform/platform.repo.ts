import "server-only";

import type { Actor } from "@/contracts/common";
import { audit } from "@/platform/audit-log";
import { toJsonInput, withTransaction } from "@/platform/db";

/**
 * Interim writer for module enable/disable. `module.<id>.enabled` is read directly from the
 * `setting` table by the registry and is NOT a registered `SettingDefinition`, so `setSetting`
 * rejects it. This writes the PLATFORM-scope row (findFirst → update/create, avoiding upsert through
 * the partial unique index per db/README) and audits it. Replace with a registry-owned toggle at
 * integration — see CR-18-GAP-MODULE-TOGGLE in phases/18/REQUESTS.md.
 */
export async function writeModuleEnabled(actor: Actor, moduleId: string, enabled: boolean): Promise<void> {
  const key = `module.${moduleId}.enabled`;
  await withTransaction(async (tx) => {
    const existing = await tx.setting.findFirst({
      where: { key, scope: "PLATFORM", userId: null },
      select: { id: true },
    });
    const updatedById = actor.type === "USER" ? actor.userId : null;
    if (existing !== null) {
      await tx.setting.update({ where: { id: existing.id }, data: { value: toJsonInput(enabled), updatedById } });
    } else {
      await tx.setting.create({ data: { key, scope: "PLATFORM", value: toJsonInput(enabled), updatedById } });
    }
    await audit.record(tx, {
      actor,
      action: "platform.module.toggle",
      targetType: "Module",
      targetId: moduleId,
      after: { enabled },
    });
  });
}
