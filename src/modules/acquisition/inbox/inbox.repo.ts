import "server-only";

/**
 * All Prisma access for the inbox area (Phase 13). Database access lives only in `*.repo.ts`
 * (project-rules). Personal data (addresses, bodies) is written here but never logged.
 */

import type { LeadStatus, Market, ReplyClass, ServiceLine } from "@/contracts/common";
import { db, isUniqueViolation, withSavepoint, type Prisma, type Tx } from "@/platform/db";
import type { ReplyActionsTaken } from "@/contracts/acquisition-records";

// ---- Mailbox sync cursors (ingest) ----

export async function getMailboxCursor(mailboxId: string): Promise<string | null> {
  const row = await db.mailboxSyncState.findUnique({ where: { mailboxId }, select: { cursor: true } });
  return row?.cursor ?? null;
}

export async function saveMailboxCursor(
  mailboxId: string,
  cursor: string | null,
  when: Date,
  lastError: string | null = null,
): Promise<void> {
  await db.mailboxSyncState.upsert({
    where: { mailboxId },
    create: { mailboxId, cursor, lastPolledAt: when, lastError },
    update: { cursor, lastPolledAt: when, lastError },
  });
}

// ---- Idempotent reply store ----

export interface CreateReplyData {
  mailboxId: string | null;
  leadId: string | null;
  contactId: string | null;
  companyId: string | null;
  messageId: string | null;
  channel: "EMAIL" | "WHATSAPP" | "LINKEDIN" | "PHONE";
  providerMessageId: string | null;
  providerThreadId: string | null;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  receivedAt: Date;
  headers: Prisma.InputJsonValue | null;
  rawBodySanitized: string | null;
  latestText: string;
  attachmentsMeta: Prisma.InputJsonValue | null;
  matchMethod: "IN_REPLY_TO" | "THREAD_ID" | "SENDER_CONTACT" | "SENDER_DOMAIN" | "MANUAL" | "UNMATCHED";
  loggedById: string | null;
}

/** Inserts a reply if one does not already exist for (mailboxId, providerMessageId). */
export async function createReply(data: CreateReplyData): Promise<{ id: string; created: boolean }> {
  if (data.mailboxId !== null && data.providerMessageId !== null) {
    const existing = await db.reply.findFirst({
      where: { mailboxId: data.mailboxId, providerMessageId: data.providerMessageId },
      select: { id: true },
    });
    if (existing !== null) return { id: existing.id, created: false };
  }
  const row = await db.reply.create({
    data: {
      mailboxId: data.mailboxId,
      leadId: data.leadId,
      contactId: data.contactId,
      companyId: data.companyId,
      messageId: data.messageId,
      channel: data.channel,
      providerMessageId: data.providerMessageId,
      providerThreadId: data.providerThreadId,
      rfcMessageId: data.rfcMessageId,
      inReplyTo: data.inReplyTo,
      references: data.references,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      subject: data.subject,
      receivedAt: data.receivedAt,
      ...(data.headers === null ? {} : { headers: data.headers }),
      rawBodySanitized: data.rawBodySanitized,
      latestText: data.latestText,
      ...(data.attachmentsMeta === null ? {} : { attachmentsMeta: data.attachmentsMeta }),
      matchMethod: data.matchMethod,
      loggedById: data.loggedById,
    },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

// ---- Matching (ingest step 4) ----

export interface MatchTarget {
  leadId: string;
  companyId: string;
  contactId: string | null;
  messageId: string | null;
}

/** 1. In-Reply-To / References → one of our stored provider or RFC message ids. */
export async function matchByMessageIds(ids: string[]): Promise<MatchTarget | null> {
  if (ids.length === 0) return null;
  const message = await db.message.findFirst({
    where: { OR: [{ providerMessageId: { in: ids } }, { rfcMessageId: { in: ids } }] },
    select: { id: true, leadId: true, companyId: true, contactId: true },
    orderBy: { sentAt: "desc" },
  });
  return message === null ? null : { leadId: message.leadId, companyId: message.companyId, contactId: message.contactId, messageId: message.id };
}

/** 2. Provider thread id → our most recent message in that thread. */
export async function matchByThreadId(providerThreadId: string | null): Promise<MatchTarget | null> {
  if (providerThreadId === null || providerThreadId === "") return null;
  const message = await db.message.findFirst({
    where: { providerThreadId },
    select: { id: true, leadId: true, companyId: true, contactId: true },
    orderBy: { sentAt: "desc" },
  });
  return message === null ? null : { leadId: message.leadId, companyId: message.companyId, contactId: message.contactId, messageId: message.id };
}

/** 3. Sender address → a contact with an active or recent enrolment (most recent message to them). */
export async function matchBySenderContact(email: string): Promise<MatchTarget | null> {
  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  if (contact === null) return null;
  const message = await db.message.findFirst({
    where: { contactId: contact.id },
    select: { id: true, leadId: true, companyId: true, contactId: true },
    orderBy: { sentAt: "desc" },
  });
  if (message !== null) return { leadId: message.leadId, companyId: message.companyId, contactId: message.contactId, messageId: message.id };
  // No message yet but the contact exists: tie to their company's open lead if any.
  const enrol = await db.enrollment.findFirst({
    where: { contactId: contact.id, status: { in: ["ACTIVE", "PAUSED", "STOPPED"] } },
    select: { leadId: true, companyId: true, contactId: true },
    orderBy: { updatedAt: "desc" },
  });
  return enrol === null ? null : { leadId: enrol.leadId, companyId: enrol.companyId, contactId: enrol.contactId, messageId: null };
}

/** 4. Sender domain → a company with an active thread (ACTIVE/PAUSED enrolment). */
export async function matchBySenderDomain(domain: string): Promise<MatchTarget | null> {
  if (domain === "") return null;
  const enrol = await db.enrollment.findFirst({
    where: { company: { normalizedDomain: domain }, status: { in: ["ACTIVE", "PAUSED"] } },
    select: { leadId: true, companyId: true, contactId: true },
    orderBy: { updatedAt: "desc" },
  });
  return enrol === null ? null : { leadId: enrol.leadId, companyId: enrol.companyId, contactId: enrol.contactId, messageId: null };
}

// ---- Lead / message reads for processing ----

export interface LeadProcessingRow {
  id: string;
  companyId: string;
  serviceLine: ServiceLine;
  market: Market;
  status: LeadStatus;
  ownerId: string | null;
  primaryContactId: string | null;
  country: string | null;
  brief: string | null;
}

export async function getLeadForProcessing(leadId: string): Promise<LeadProcessingRow | null> {
  return db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      companyId: true,
      serviceLine: true,
      market: true,
      status: true,
      ownerId: true,
      primaryContactId: true,
      country: true,
      brief: true,
    },
  });
}

export async function getReplyRow(replyId: string) {
  return db.reply.findUnique({ where: { id: replyId } });
}

export async function getUserName(userId: string): Promise<string | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  return row?.name ?? null;
}

export async function getContactEmail(contactId: string): Promise<string | null> {
  const row = await db.contact.findUnique({ where: { id: contactId }, select: { email: true } });
  return row?.email ?? null;
}

/** The most recent outbound message in the reply's thread, for classification/draft context. */
export async function getThreadContext(leadId: string, limit = 12) {
  return db.message.findMany({
    where: { leadId, status: { in: ["SENT", "SENT_MOCK", "SENT_ASSISTED"] } },
    select: { subject: true, body: true, sentAt: true, kind: true },
    orderBy: { sentAt: "asc" },
    take: limit,
  });
}

/** Non-dismissed findings with evidence, usable for citing in a draft (INV-18). */
export async function getCitableFindings(leadId: string) {
  return db.auditFinding.findMany({
    where: {
      leadId,
      dismissedAt: null,
      OR: [{ sourceUrl: { not: null } }, { artifactKey: { not: null } }],
    },
    select: { id: true, checkId: true, severity: true, claim: true, sourceUrl: true },
    orderBy: [{ pitchable: "desc" }, { severity: "desc" }],
    take: 20,
  });
}

// ---- Reply mutations ----

export async function updateReplyClassification(
  tx: Tx,
  replyId: string,
  fields: Prisma.ReplyUpdateInput,
): Promise<void> {
  await tx.reply.update({ where: { id: replyId }, data: fields });
}

export async function createReplyCorrection(
  tx: Tx,
  input: { replyId: string; fromClass: ReplyClass | null; toClass: ReplyClass; note: string | null; actorId: string },
): Promise<void> {
  await tx.replyCorrection.create({
    data: {
      replyId: input.replyId,
      ...(input.fromClass === null ? {} : { fromClass: input.fromClass }),
      toClass: input.toClass,
      ...(input.note === null ? {} : { note: input.note }),
      actorId: input.actorId,
    },
  });
}

export async function appendReplyActions(tx: Tx, replyId: string, add: ReplyActionsTaken): Promise<void> {
  const row = await tx.reply.findUnique({ where: { id: replyId }, select: { actionsTaken: true } });
  const existing = Array.isArray(row?.actionsTaken) ? (row.actionsTaken as unknown as ReplyActionsTaken) : [];
  const merged = [...existing, ...add].slice(-50);
  await tx.reply.update({ where: { id: replyId }, data: { actionsTaken: merged as unknown as Prisma.InputJsonValue } });
}

export async function setReplyMatch(
  tx: Tx,
  replyId: string,
  match: { leadId: string; companyId: string; contactId: string | null; messageId: string | null; matchMethod: "MANUAL" },
): Promise<void> {
  await tx.reply.update({
    where: { id: replyId },
    data: {
      leadId: match.leadId,
      companyId: match.companyId,
      contactId: match.contactId,
      messageId: match.messageId,
      matchMethod: match.matchMethod,
      // Re-open for processing now that it is linked to a lead.
      processedAt: null,
      needsHumanReview: false,
    },
  });
}

const OPEN_LEAD_STATUSES: readonly LeadStatus[] = [
  "NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED", "SCORED", "IN_REVIEW", "APPROVED",
  "CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "NURTURE",
];

/**
 * Inserts a suppression idempotently (INV-2). A savepoint keeps the surrounding transaction usable
 * on the partial-unique-index conflict. Returns the new row id, or null when one already existed.
 * This mirrors Phase 12's actor-less unsubscribe/bounce cascade (phases/12/REQUESTS.md CR-12-04).
 */
export async function insertSuppression(
  tx: Tx,
  input: { type: "EMAIL" | "DOMAIN" | "PHONE"; value: string; reason: "UNSUBSCRIBE"; source: "REPLY"; note?: string },
): Promise<string | null> {
  try {
    const row = await withSavepoint(tx, () =>
      tx.suppression.create({
        data: { type: input.type, value: input.value, reason: input.reason, source: input.source, ...(input.note === undefined ? {} : { note: input.note }) },
        select: { id: true },
      }),
    );
    return row.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export async function findOpenLeadIdsForCompany(tx: Tx, companyId: string): Promise<string[]> {
  const rows = await tx.lead.findMany({ where: { companyId, status: { in: [...OPEN_LEAD_STATUSES] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function getMinimalLead(
  tx: Tx,
  leadId: string,
): Promise<{ status: LeadStatus; serviceLine: ServiceLine; market: Market } | null> {
  return tx.lead.findUnique({ where: { id: leadId }, select: { status: true, serviceLine: true, market: true } });
}

export async function getUserServiceLines(userId: string): Promise<ServiceLine[]> {
  const row = await db.teamProfile.findUnique({ where: { userId }, select: { serviceLines: true } });
  return row?.serviceLines ?? [];
}

// ---- Inbox thread (assignment, snooze, unread, activity) ----

export async function touchInboxThreadInbound(tx: Tx, leadId: string, at: Date): Promise<void> {
  await tx.inboxThread.upsert({
    where: { leadId },
    create: { leadId, lastInboundAt: at, unreadCount: 1 },
    update: { lastInboundAt: at, unreadCount: { increment: 1 } },
  });
}

export async function getInboxThread(leadId: string) {
  return db.inboxThread.findUnique({ where: { leadId } });
}

export async function setThreadAssignee(tx: Tx, leadId: string, assigneeId: string | null): Promise<void> {
  await tx.inboxThread.upsert({
    where: { leadId },
    create: { leadId, assigneeId },
    update: { assigneeId },
  });
}

export async function setThreadSnooze(tx: Tx, leadId: string, until: Date | null): Promise<void> {
  await tx.inboxThread.upsert({
    where: { leadId },
    create: { leadId, snoozedUntil: until },
    update: { snoozedUntil: until },
  });
}

/** Marks every reply on a lead read/unread (shared team read state) and resets the unread counter. */
export async function setLeadReadState(tx: Tx, leadId: string, read: boolean, at: Date): Promise<void> {
  await tx.reply.updateMany({ where: { leadId }, data: { readAt: read ? at : null } });
  await tx.inboxThread.upsert({
    where: { leadId },
    create: { leadId, unreadCount: read ? 0 : 1 },
    update: { unreadCount: read ? 0 : 1 },
  });
}

// ---- Lead owner (routing) ----

export async function setLeadOwnerIfUnset(
  tx: Tx,
  leadId: string,
  userId: string,
): Promise<{ changed: boolean; previous: string | null }> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
  if (lead === null) return { changed: false, previous: null };
  if (lead.ownerId !== null) return { changed: false, previous: lead.ownerId };
  await tx.lead.update({ where: { id: leadId }, data: { ownerId: userId } });
  return { changed: true, previous: null };
}

export async function setLeadNextAction(tx: Tx, leadId: string, at: Date | null): Promise<void> {
  await tx.lead.update({ where: { id: leadId }, data: { nextActionAt: at } });
}

// ---- Team capacity / working pattern (routing + SLA; read directly like pipeline.repo.ts) ----

export interface OwnerCapacity {
  userId: string;
  weeklyCapacity: number;
  currentLoad: number;
  headroom: number;
}

/** Capacity for the given users, highest free capacity first (for weighted round-robin routing). */
export async function getOwnerCapacities(userIds: string[]): Promise<OwnerCapacity[]> {
  if (userIds.length === 0) return [];
  const rows = await db.teamProfile.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, weeklyCapacity: true, currentLoad: true },
  });
  return rows
    .map((r) => ({ userId: r.userId, weeklyCapacity: r.weeklyCapacity, currentLoad: r.currentLoad, headroom: r.weeklyCapacity - r.currentLoad }))
    .sort((a, b) => b.headroom - a.headroom);
}

export interface WorkingPatternRow {
  timezone: string;
  workingDays: number[];
  workingHoursStart: string;
  workingHoursEnd: string;
}

export async function getWorkingPattern(userId: string): Promise<WorkingPatternRow | null> {
  const row = await db.teamProfile.findUnique({
    where: { userId },
    select: { timezone: true, workingDays: true, workingHoursStart: true, workingHoursEnd: true },
  });
  return row;
}

// ---- SLA ----

export async function setReplySla(
  tx: Tx,
  replyId: string,
  fields: { slaStatus: "ON_TRACK" | "WARNING" | "BREACHED" | "MET" | "NONE"; slaDueAt?: Date | null; firstResponseAt?: Date | null; slaWarnedAt?: Date | null; slaBreachedAt?: Date | null },
): Promise<void> {
  await tx.reply.update({ where: { id: replyId }, data: fields });
}

// ---- SLA check + nurture reminder scans (jobs) ----

export async function findRepliesForSlaCheck() {
  return db.reply.findMany({
    where: {
      slaStatus: { in: ["ON_TRACK", "WARNING"] },
      firstResponseAt: null,
      slaDueAt: { not: null },
    },
    select: {
      id: true,
      receivedAt: true,
      slaDueAt: true,
      slaStatus: true,
      leadId: true,
      lead: { select: { ownerId: true, serviceLine: true } },
    },
    take: 500,
  });
}

export async function findDueNurtureReminders(now: Date) {
  return db.lead.findMany({
    where: {
      status: "NURTURE",
      nurtureReason: "NOT_NOW",
      nextActionAt: { not: null, lte: now },
      ownerId: { not: null },
    },
    select: { id: true, ownerId: true, serviceLine: true, nextActionAt: true, company: { select: { name: true } } },
    take: 500,
  });
}

// ---- Draft reply messages (INV-5) ----

export interface ReplyDraftInput {
  leadId: string;
  companyId: string;
  contactId: string | null;
  subject: string | null;
  body: string;
  needsPricingApproval: boolean;
  inReplyToMessageId: string | null;
  inReplyToReplyId: string;
  citedFindingIds: string[];
  aiCallId: string | null;
}

export async function createReplyDraftMessage(tx: Tx, input: ReplyDraftInput): Promise<string> {
  const message = await tx.message.create({
    data: {
      leadId: input.leadId,
      companyId: input.companyId,
      contactId: input.contactId,
      kind: "ONE_OFF",
      channel: "EMAIL",
      status: "DRAFT",
      subject: input.subject,
      body: input.body,
      needsPricingApproval: input.needsPricingApproval,
      inReplyToMessageId: input.inReplyToMessageId,
      inReplyToReplyId: input.inReplyToReplyId,
      aiCallId: input.aiCallId,
    },
    select: { id: true },
  });
  for (const findingId of input.citedFindingIds) {
    await tx.messageCitation.create({ data: { messageId: message.id, findingId } });
  }
  return message.id;
}

/** Marks any outstanding DRAFT reply holders for a reply as superseded once a reply is sent. */
export async function cancelReplyDrafts(tx: Tx, replyId: string): Promise<void> {
  await tx.message.updateMany({
    where: { inReplyToReplyId: replyId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
}

// ---- Read queries for the inbox services (Phase 16 UI) ----

export interface ThreadListFilter {
  serviceLine: ServiceLine;
  market?: Market;
  ownerId?: string;
  classification?: ReplyClass;
  unread?: boolean;
  needsHumanReview?: boolean;
  slaStatus?: "NONE" | "ON_TRACK" | "WARNING" | "BREACHED" | "MET";
  before?: Date;
  limit: number;
}

export async function listThreadRows(filter: ThreadListFilter) {
  const where: Prisma.ReplyWhereInput = {
    leadId: { not: null },
    lead: {
      serviceLine: filter.serviceLine,
      ...(filter.market === undefined ? {} : { market: filter.market }),
      ...(filter.ownerId === undefined ? {} : { ownerId: filter.ownerId }),
    },
    ...(filter.classification === undefined ? {} : { classification: filter.classification }),
    ...(filter.unread === true ? { readAt: null } : filter.unread === false ? { readAt: { not: null } } : {}),
    ...(filter.needsHumanReview === undefined ? {} : { needsHumanReview: filter.needsHumanReview }),
    ...(filter.slaStatus === undefined ? {} : { slaStatus: filter.slaStatus }),
    ...(filter.before === undefined ? {} : { receivedAt: { lt: filter.before } }),
  };
  return db.reply.findMany({
    where,
    distinct: ["leadId"],
    orderBy: [{ leadId: "desc" }, { receivedAt: "desc" }],
    take: filter.limit,
    select: {
      id: true,
      leadId: true,
      classification: true,
      slaStatus: true,
      slaDueAt: true,
      summary: true,
      readAt: true,
      receivedAt: true,
      needsHumanReview: true,
      lead: { select: { serviceLine: true, market: true, ownerId: true, company: { select: { name: true } }, inboxThread: { select: { unreadCount: true, assigneeId: true } } } },
    },
  });
}

export async function getThreadDetail(leadId: string) {
  const [messages, replies] = await Promise.all([
    db.message.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, status: true, subject: true, body: true, sentAt: true, createdAt: true, needsPricingApproval: true, inReplyToReplyId: true },
    }),
    db.reply.findMany({
      where: { leadId },
      orderBy: { receivedAt: "asc" },
      select: {
        id: true, channel: true, classification: true, classificationSource: true, confidence: true,
        summary: true, latestText: true, receivedAt: true, readAt: true, slaStatus: true, slaDueAt: true,
        needsHumanReview: true, objectionSummary: true, questions: true, actionsTaken: true, loggedById: true,
      },
    }),
  ]);
  return { messages, replies };
}

export async function listUnmatchedRows(limit: number) {
  return db.reply.findMany({
    where: { matchMethod: "UNMATCHED", leadId: null },
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: { id: true, fromAddress: true, subject: true, summary: true, receivedAt: true, mailboxId: true },
  });
}

export async function countActionableAndUnread(serviceLines: ServiceLine[], ownerId?: string): Promise<{ serviceLine: ServiceLine; unread: number; actionable: number }[]> {
  const out: { serviceLine: ServiceLine; unread: number; actionable: number }[] = [];
  for (const serviceLine of serviceLines) {
    const base: Prisma.ReplyWhereInput = { lead: { serviceLine, ...(ownerId === undefined ? {} : { ownerId }) } };
    const [unread, actionable] = await Promise.all([
      db.reply.count({ where: { ...base, readAt: null } }),
      db.reply.count({ where: { ...base, slaStatus: { in: ["ON_TRACK", "WARNING", "BREACHED"] } } }),
    ]);
    out.push({ serviceLine, unread, actionable });
  }
  return out;
}

export async function getLeadScopeForReply(replyId: string): Promise<{ leadId: string | null; serviceLine: ServiceLine | null; ownerId: string | null } | null> {
  const reply = await db.reply.findUnique({
    where: { id: replyId },
    select: { leadId: true, lead: { select: { serviceLine: true, ownerId: true } } },
  });
  if (reply === null) return null;
  return { leadId: reply.leadId, serviceLine: reply.lead?.serviceLine ?? null, ownerId: reply.lead?.ownerId ?? null };
}

export async function markReplyAnswered(tx: Tx, replyId: string, at: Date): Promise<void> {
  const reply = await tx.reply.update({
    where: { id: replyId },
    data: { firstResponseAt: at, slaStatus: "MET" },
    select: { leadId: true },
  });
  if (reply.leadId !== null) {
    await tx.inboxThread.upsert({
      where: { leadId: reply.leadId },
      create: { leadId: reply.leadId, lastOutboundAt: at },
      update: { lastOutboundAt: at },
    });
  }
}
