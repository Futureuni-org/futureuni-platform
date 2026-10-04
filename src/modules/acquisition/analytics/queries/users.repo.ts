/**
 * Minimal user-name lookup for analytics labels (owner breakdowns and the SLA-by-owner panel).
 * Read-only; returns names only, never emails or any other personal field (project-rules §Roles).
 */

import "server-only";

import { db } from "@/platform/db";

/** Maps user id → display name for the given ids (ids with no row are omitted). */
export async function getUserNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Maps company id → name for the given ids (for the cross-sell table). */
export async function getCompanyNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.company.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}
