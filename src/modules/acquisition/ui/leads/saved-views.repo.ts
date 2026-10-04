import "server-only";

/**
 * Per-user saved views for the leads list, stored in the platform `SavedView` model (scope
 * `acquisition.leads:<line>`). Saved views are SELF-scoped, so every read and write filters by the
 * signed-in user's id; the calling action authenticates and passes it. The `query` column holds the
 * URL-param record the leads list understands (`lead-filters.ts`).
 */

import { AppError } from "@/lib/errors";
import { db, type Prisma } from "@/platform/db";
import type { ServiceLine } from "@/contracts/common";

import { LEAD_FILTER_KEYS } from "./lead-filters";

/** The most views one person can save for one line. */
export const MAX_SAVED_VIEWS = 30;

export interface SavedViewRow {
  id: string;
  name: string;
  query: Record<string, string>;
  isDefault: boolean;
}

function scopeFor(serviceLine: ServiceLine): string {
  return `acquisition.leads:${serviceLine}`;
}

const FILTER_KEYS: ReadonlySet<string> = new Set(LEAD_FILTER_KEYS);

/** A stored query as the leads list's own params only; anything else in the JSON is dropped. */
function toQueryRecord(value: Prisma.JsonValue): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && FILTER_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export async function listSavedViews(
  userId: string,
  serviceLine: ServiceLine,
): Promise<SavedViewRow[]> {
  const rows = await db.savedView.findMany({
    where: { userId, scope: scopeFor(serviceLine) },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    take: MAX_SAVED_VIEWS,
    select: { id: true, name: true, query: true, isDefault: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    query: toQueryRecord(r.query),
    isDefault: r.isDefault,
  }));
}

/** Saves a view under `name`, replacing the person's existing view of that name on this line. */
export async function createSavedView(
  userId: string,
  serviceLine: ServiceLine,
  name: string,
  query: Record<string, string>,
): Promise<SavedViewRow> {
  const scope = scopeFor(serviceLine);
  const [existing, count] = await Promise.all([
    db.savedView.findUnique({
      where: { userId_scope_name: { userId, scope, name } },
      select: { id: true },
    }),
    db.savedView.count({ where: { userId, scope } }),
  ]);
  if (existing === null && count >= MAX_SAVED_VIEWS) {
    throw new AppError(
      "CONFLICT",
      `You can save up to ${String(MAX_SAVED_VIEWS)} views for a line. Delete one to save another.`,
    );
  }
  const row = await db.savedView.upsert({
    where: { userId_scope_name: { userId, scope, name } },
    create: { userId, scope, name, query },
    update: { query },
    select: { id: true, name: true, query: true, isDefault: true },
  });
  return { id: row.id, name: row.name, query: toQueryRecord(row.query), isDefault: row.isDefault };
}

export async function deleteSavedView(userId: string, id: string): Promise<void> {
  // Scoped by userId so a user can only remove their own view.
  await db.savedView.deleteMany({ where: { id, userId } });
}
