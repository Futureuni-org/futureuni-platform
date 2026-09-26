import { z } from "zod";

import type { CursorPageInput, Page } from "@/contracts/common";

/** The largest page any list returns, whatever the caller asks for. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** A keyset position: the sort value and the id tiebreaker of the last row returned. */
export interface Cursor {
  createdAt: Date;
  id: string;
}

const encodedCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string().min(1).max(64),
});

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

/** A malformed or tampered cursor reads as "no cursor" (the first page). */
export function decodeCursor(raw: string | undefined): Cursor | null {
  if (raw === undefined || raw === "") return null;
  try {
    const parsed = encodedCursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return parsed.success
      ? { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id }
      : null;
  } catch {
    return null;
  }
}

/**
 * The keyset condition for "rows after this cursor" in `ORDER BY createdAt DESC, id DESC`.
 * Combine it with the caller's filters under `AND`, never by spreading (a spread would replace a
 * filter's own `OR`): `where: { AND: [filters, afterClause(after)] }`.
 */
export function afterClause(after: Cursor | null) {
  if (after === null) return {};
  return {
    OR: [
      { createdAt: { lt: after.createdAt } },
      { createdAt: after.createdAt, id: { lt: after.id } },
    ],
  };
}

/** The order that matches `afterClause`: newest first, id as the unique tiebreaker. */
export const NEWEST_FIRST = [
  { createdAt: "desc" },
  { id: "desc" },
] as const satisfies readonly Record<string, "asc" | "desc">[];

/**
 * Cursor pagination (saas-data): fetches one row more than the page to know whether another page
 * exists. `fetch` must order by `NEWEST_FIRST` and apply `afterClause(after)`.
 *
 * @example
 * const page = await paginate(input, ({ after, take }) =>
 *   tx.lead.findMany({ where: { AND: [{ serviceLine }, afterClause(after)] }, orderBy: [...NEWEST_FIRST], take, select }),
 * );
 */
export async function paginate<T extends { id: string; createdAt: Date }>(
  input: Partial<CursorPageInput>,
  fetch: (args: { after: Cursor | null; take: number }) => Promise<T[]>,
): Promise<Page<T>> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const rows = await fetch({ after: decodeCursor(input.cursor), take: limit + 1 });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last) : null,
  };
}
