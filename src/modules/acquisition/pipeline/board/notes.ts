/**
 * Lead notes with teammate mentions (module spec API-A43, M14-AC7). A note is a generic
 * `Note` row (`targetType = "acquisition.lead"`); mentioned teammates are notified.
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";
import { notifySafe } from "../shared";

import * as repo from "../pipeline.repo";
import { PIPELINE_NOTIFICATION_TYPES } from "../notifications";

const LEAD_TARGET = "acquisition.lead";

export interface AddNoteInput {
  body: string;
  mentions?: string[];
}

export async function addLeadNote(actor: Actor, leadId: string, input: AddNoteInput): Promise<{ noteId: string }> {
  if (input.body.trim() === "") throw new AppError("VALIDATION_FAILED", "A note needs some text.");
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.update", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  const authorId = actor.type === "USER" ? actor.userId : null;
  if (authorId === null) throw new AppError("FORBIDDEN", "A note must be written by a user.");

  const mentions = [...new Set(input.mentions ?? [])].filter((id) => id !== authorId);

  const noteId = await withTransaction(async (tx) => {
    const note = await repo.createNote(tx, {
      authorId,
      targetType: LEAD_TARGET,
      targetId: leadId,
      companyId: scope.companyId,
      body: input.body.trim(),
      mentions,
    });
    await audit.record(tx, { actor, action: "acquisition.lead.update", targetType: LEAD_TARGET, targetId: leadId, after: { note: note.id, mentions: mentions.length } });
    return note.id;
  });

  if (mentions.length > 0) {
    await notifySafe({
      userIds: mentions,
      type: PIPELINE_NOTIFICATION_TYPES.noteMentioned,
      title: "You were mentioned in a note",
      dedupeKey: `note.mentioned:${noteId}`,
    });
  }
  return { noteId };
}

export async function listLeadNotes(actor: Actor, leadId: string): Promise<repo.NoteRow[]> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.lead.read", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  return repo.listNotes(LEAD_TARGET, leadId);
}
