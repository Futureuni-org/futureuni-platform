import "server-only";

/**
 * Inbox read + mutation services for the UI (Phase 16) and platform home (module spec §3.12, prompt
 * step 7). Every call is permission-checked (line-scoped; MEMBER sees only their own leads) and
 * mutations are audited. `linkReply` attaches an unmatched reply to a lead and re-runs processing.
 */

import type { Actor, Market, ReplyClass, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

import {
  countActionableAndUnread,
  getLeadForProcessing,
  getThreadDetail,
  getUserServiceLines,
  listThreadRows,
  listUnmatchedRows,
  setLeadReadState,
  setReplyMatch,
  touchInboxThreadInbound,
  type ThreadListFilter,
} from "./inbox.repo";
import { processReply } from "./actions/process";

export interface ListThreadsInput {
  serviceLine: ServiceLine;
  market?: Market;
  classification?: ReplyClass;
  unread?: boolean;
  ownerId?: string;
  needsHumanReview?: boolean;
  slaStatus?: "NONE" | "ON_TRACK" | "WARNING" | "BREACHED" | "MET";
  cursor?: string;
  limit?: number;
}

/** MEMBER actors are OWN-scoped; everyone else is LINES/ALL (asserted per call). */
function ownScope(actor: Actor): string | undefined {
  return actor.type === "USER" && actor.role === "MEMBER" ? actor.userId : undefined;
}

export async function listThreads(actor: Actor, input: ListThreadsInput): Promise<{ items: ThreadListItem[]; nextCursor: string | null }> {
  const own = ownScope(actor);
  await assertActorCan(actor, "acquisition.inbox.read", {
    serviceLine: input.serviceLine,
    ...(own === undefined ? {} : { ownerId: own }),
  });
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const ownerFilter = own ?? input.ownerId;
  const filter: ThreadListFilter = {
    serviceLine: input.serviceLine,
    ...(input.market === undefined ? {} : { market: input.market }),
    ...(ownerFilter === undefined ? {} : { ownerId: ownerFilter }),
    ...(input.classification === undefined ? {} : { classification: input.classification }),
    ...(input.unread === undefined ? {} : { unread: input.unread }),
    ...(input.needsHumanReview === undefined ? {} : { needsHumanReview: input.needsHumanReview }),
    ...(input.slaStatus === undefined ? {} : { slaStatus: input.slaStatus }),
    ...(input.cursor === undefined ? {} : { before: new Date(input.cursor) }),
    limit,
  };
  const rows = await listThreadRows(filter);
  const items: ThreadListItem[] = rows.map((r) => ({
    leadId: r.leadId ?? "",
    companyName: r.lead?.company.name ?? "Unknown",
    serviceLine: r.lead?.serviceLine ?? input.serviceLine,
    market: r.lead?.market ?? null,
    ownerId: r.lead?.ownerId ?? null,
    classification: r.classification,
    slaStatus: r.slaStatus,
    slaDueAt: r.slaDueAt?.toISOString() ?? null,
    summary: r.summary,
    unread: r.lead?.inboxThread?.unreadCount ?? (r.readAt === null ? 1 : 0),
    needsHumanReview: r.needsHumanReview,
    latestAt: r.receivedAt.toISOString(),
  }));
  const nextCursor = rows.length === limit ? (rows.at(-1)?.receivedAt.toISOString() ?? null) : null;
  return { items, nextCursor };
}

export interface ThreadListItem {
  leadId: string;
  companyName: string;
  serviceLine: ServiceLine;
  market: Market | null;
  ownerId: string | null;
  classification: ReplyClass | null;
  slaStatus: string;
  slaDueAt: string | null;
  summary: string | null;
  unread: number;
  needsHumanReview: boolean;
  latestAt: string;
}

export async function getThread(actor: Actor, leadId: string) {
  const lead = await getLeadForProcessing(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.inbox.read", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });
  return getThreadDetail(leadId);
}

export async function markRead(actor: Actor, leadId: string): Promise<void> {
  await setReadState(actor, leadId, true);
}

export async function markUnread(actor: Actor, leadId: string): Promise<void> {
  await setReadState(actor, leadId, false);
}

async function setReadState(actor: Actor, leadId: string, read: boolean): Promise<void> {
  const lead = await getLeadForProcessing(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.inbox.read", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });
  await withTransaction((tx) => setLeadReadState(tx, leadId, read, new Date()));
}

export async function getUnmatchedReplies(actor: Actor): Promise<{ id: string; fromAddress: string | null; subject: string | null; summary: string | null; receivedAt: string }[]> {
  await assertActorCan(actor, "acquisition.inbox.link");
  const rows = await listUnmatchedRows(100);
  return rows.map((r) => ({ id: r.id, fromAddress: r.fromAddress, subject: r.subject, summary: r.summary, receivedAt: r.receivedAt.toISOString() }));
}

export async function linkReply(actor: Actor, replyId: string, leadId: string): Promise<void> {
  const lead = await getLeadForProcessing(leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.inbox.link", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });
  await withTransaction(async (tx) => {
    await setReplyMatch(tx, replyId, {
      leadId,
      companyId: lead.companyId,
      contactId: lead.primaryContactId,
      messageId: null,
      matchMethod: "MANUAL",
    });
    await touchInboxThreadInbound(tx, leadId, new Date());
    await audit.record(tx, {
      actor,
      action: "acquisition.inbox.link",
      targetType: "Reply",
      targetId: replyId,
      after: { leadId },
    });
  });
  await processReply(replyId, { now: () => new Date() });
}

export async function getInboxCounts(actor: Actor, userId: string): Promise<{ byLine: { serviceLine: ServiceLine; unread: number; actionable: number }[]; totalUnread: number; totalActionable: number }> {
  await assertActorCan(actor, "acquisition.module.access");
  const lines = await getUserServiceLines(userId);
  const byLine = await countActionableAndUnread(lines, userId);
  const totalUnread = byLine.reduce((n, l) => n + l.unread, 0);
  const totalActionable = byLine.reduce((n, l) => n + l.actionable, 0);
  return { byLine, totalUnread, totalActionable };
}
