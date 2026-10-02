"use server";

/**
 * Audit-log export. `listAudit` carries no permission check (its callers gate it), so this action
 * asserts `platform.audit.export` before gathering rows. Reads up to a page cap and returns a CSV
 * string the client downloads.
 */

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { assertCan, requireUser } from "@/platform/auth";
import { exportAuditCsv, listAudit, type AuditListItem, type AuditQuery } from "@/platform/audit-log";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the filters and try again.", {
    details: { issues },
  });
}

const FiltersSchema = z.object({
  actorId: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  targetType: z.string().trim().max(60).optional(),
  targetId: z.string().trim().max(60).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

const MAX_PAGES = 50;
const PAGE = 100;

export async function exportAuditCsvAction(
  filters: z.input<typeof FiltersSchema>,
): Promise<ActionResult<{ csv: string; rows: number }>> {
  try {
    const user = await requireUser();
    assertCan(user, "platform.audit.export");
    const parsed = FiltersSchema.safeParse(filters);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const f = parsed.data;

    const base: AuditQuery = {
      ...(f.actorId ? { actorId: f.actorId } : {}),
      ...(f.action ? { action: f.action } : {}),
      ...(f.targetType ? { targetType: f.targetType } : {}),
      ...(f.targetId ? { targetId: f.targetId } : {}),
      ...(f.from ? { from: new Date(`${f.from}T00:00:00.000Z`) } : {}),
      ...(f.to ? { to: new Date(`${f.to}T23:59:59.999Z`) } : {}),
      limit: PAGE,
    };

    const all: AuditListItem[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { items, nextCursor } = await listAudit({
        ...base,
        ...(cursor === undefined ? {} : { cursor }),
      });
      all.push(...items);
      if (nextCursor === null) break;
      cursor = nextCursor;
    }

    return ok({ csv: exportAuditCsv(all), rows: all.length });
  } catch (error) {
    return err(error);
  }
}
