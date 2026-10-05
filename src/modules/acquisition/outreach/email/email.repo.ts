import "server-only";

/**
 * Data access for messages and their citations (naming convention: `*.repo.ts`). Loads the full
 * context the send path needs (message + lead + contact + company + mailbox).
 */

import { dbOr, type Message, type Prisma, type Tx } from "@/platform/db";

const MESSAGE_FOR_SEND_INCLUDE = {
  lead: {
    select: {
      id: true,
      status: true,
      serviceLine: true,
      market: true,
      ownerId: true,
      firstContactedAt: true,
      complianceReview: true,
    },
  },
  company: {
    select: {
      id: true,
      name: true,
      country: true,
      city: true,
      region: true,
      timezone: true,
      normalizedDomain: true,
    },
  },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      role: true,
      email: true,
      emailStatus: true,
      phone: true,
      whatsappStatus: true,
      linkedinUrl: true,
    },
  },
  enrollment: { select: { id: true, mailboxId: true, currentStepIndex: true, status: true } },
  mailbox: true,
  citations: { select: { id: true, findingId: true, signalId: true } },
  // The attached files (a proposal PDF, say), so the send path puts them on the outbound email.
  attachments: {
    select: {
      filename: true,
      fileObject: { select: { key: true, contentType: true } },
    },
  },
} satisfies Prisma.MessageInclude;

export type MessageForSend = Prisma.MessageGetPayload<{ include: typeof MESSAGE_FOR_SEND_INCLUDE }>;

export function loadMessageForSend(tx: Tx | null, messageId: string): Promise<MessageForSend | null> {
  return dbOr(tx).message.findUnique({ where: { id: messageId }, include: MESSAGE_FOR_SEND_INCLUDE });
}

export function findMessage(tx: Tx | null, messageId: string): Promise<Message | null> {
  return dbOr(tx).message.findUnique({ where: { id: messageId } });
}

export function findMessageByProviderId(
  tx: Tx | null,
  providerMessageId: string,
): Promise<Message | null> {
  return dbOr(tx).message.findUnique({ where: { providerMessageId } });
}

export function createMessage(tx: Tx, data: Prisma.MessageUncheckedCreateInput): Promise<Message> {
  return tx.message.create({ data });
}

export function updateMessage(
  tx: Tx | null,
  id: string,
  data: Prisma.MessageUncheckedUpdateInput,
): Promise<Message> {
  return dbOr(tx).message.update({ where: { id }, data });
}

/** Creates one citation row per finding/signal id (INV-5). Exactly one of the two is set per row. */
export async function createCitations(
  tx: Tx,
  messageId: string,
  findingIds: readonly string[],
  signalIds: readonly string[] = [],
): Promise<void> {
  const rows: Prisma.MessageCitationUncheckedCreateInput[] = [
    ...findingIds.map((findingId) => ({ messageId, findingId })),
    ...signalIds.map((signalId) => ({ messageId, signalId })),
  ];
  if (rows.length === 0) return;
  await tx.messageCitation.createMany({ data: rows });
}

/** Previous messages on this lead's thread, oldest first (for the drafting context and threading). */
export function listThreadMessages(
  tx: Tx | null,
  leadId: string,
): Promise<Pick<Message, "id" | "subject" | "body" | "channel" | "stepIndex" | "sentAt" | "rfcMessageId" | "providerThreadId" | "mailboxId" | "status">[]> {
  return dbOr(tx).message.findMany({
    where: { leadId, status: { in: ["SENT", "SENT_ASSISTED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      subject: true,
      body: true,
      channel: true,
      stepIndex: true,
      sentAt: true,
      rfcMessageId: true,
      providerThreadId: true,
      mailboxId: true,
      status: true,
    },
  });
}

/**
 * Returns the ids of cited findings that have since been dismissed (INV-18). A non-empty result
 * means the message can no longer be approved or sent.
 */
export async function dismissedCitedFindingIds(
  tx: Tx | null,
  messageId: string,
): Promise<string[]> {
  const citations = await dbOr(tx).messageCitation.findMany({
    where: { messageId, findingId: { not: null } },
    select: { findingId: true },
  });
  const findingIds = citations.flatMap((c) => (c.findingId === null ? [] : [c.findingId]));
  if (findingIds.length === 0) return [];
  const dismissed = await dbOr(tx).auditFinding.findMany({
    where: { id: { in: findingIds }, dismissedAt: { not: null } },
    select: { id: true },
  });
  return dismissed.map((f) => f.id);
}

/** Enrolment-scoped look-up: the most recent sent message on a lead's thread, for mailbox affinity. */
export async function threadMailboxId(tx: Tx | null, leadId: string): Promise<string | null> {
  const last = await dbOr(tx).message.findFirst({
    where: { leadId, mailboxId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { mailboxId: true },
  });
  return last?.mailboxId ?? null;
}

export type { Message };
