import "server-only";

import type { Note, Tx } from "@/platform/db";

/**
 * Database access lives in `*.repo.ts` files (CLAUDE.md conventions). This example reads the
 * platform's shared notes for this module; the module's own tables go in
 * prisma/schema/__MODULE_ID__.prisma with a short table prefix.
 */
export function findRecentNotes(tx: Tx, limit: number): Promise<Note[]> {
  return tx.note.findMany({
    where: { module: "__MODULE_ID__" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100),
  });
}
