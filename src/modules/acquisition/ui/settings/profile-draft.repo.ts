import "server-only";

/**
 * Interim "discard draft" writer for the profile editor.
 *
 * `@/modules/acquisition/profiles` exposes `saveDraft` / `publishProfile` / `rollbackProfile` but
 * no way to delete an open DRAFT. Rather than edit another phase's module, this `*.repo.ts` deletes
 * the draft row and audits it (INV-20). Replace with a `discardDraft(actor, line)` service on the
 * profiles module at Wave 4 integration — see CR-18-GAP-DISCARD-DRAFT in phases/18/REQUESTS.md.
 */

import type { Actor, ServiceLine } from "@/contracts/common";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

export async function discardDraft(actor: Actor, line: ServiceLine): Promise<{ discarded: boolean }> {
  return withTransaction(async (tx) => {
    const draft = await tx.serviceLineProfileVersion.findFirst({
      where: { serviceLine: line, status: "DRAFT" },
      select: { id: true, version: true },
    });
    if (draft === null) return { discarded: false };
    await tx.serviceLineProfileVersion.delete({ where: { id: draft.id } });
    await audit.record(tx, {
      actor,
      action: "acquisition.profile.edit",
      targetType: "ServiceLineProfileVersion",
      targetId: draft.id,
      after: { discarded: true, version: draft.version },
    });
    return { discarded: true };
  });
}
