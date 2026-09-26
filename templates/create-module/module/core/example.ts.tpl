import "server-only";

import { db } from "@/platform/db";

import { findRecentNotes } from "./example.repo";

/** Pure domain logic: easy to unit test without a database. */
export function formatNoteCount(count: number): string {
  return count === 1 ? "1 note" : `${String(count)} notes`;
}

/** A service: reads through the module's repo, then applies the domain logic. */
export async function describeRecentNotes(limit: number): Promise<string> {
  const notes = await findRecentNotes(db, limit);
  return formatNoteCount(notes.length);
}
