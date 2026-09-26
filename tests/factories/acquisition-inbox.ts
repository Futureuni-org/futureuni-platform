/**
 * Factories for the inbox and compliance: replies, corrections, inbox threads, suppressions,
 * consent records and data-subject requests.
 */

import type {
  ConsentRecord,
  DataSubjectRequest,
  InboxThread,
  Prisma,
  Reply,
  ReplyCorrection,
  Suppression,
  Tx,
} from "@/platform/db";

import { createLead } from "./acquisition-leads";
import { createUser } from "./core";
import { createContact } from "./directory";
import { FIXED_NOW, uniqueEmail, uniqueToken } from "./sequence";

type Input<T> = Partial<T>;

/**
 * An INTERESTED email reply matched to a new CONTACTED lead. Pass leadId to attach it elsewhere,
 * or `leadId: null` for an UNMATCHED reply.
 */
export async function createReply(
  tx: Tx,
  overrides: Input<Prisma.ReplyUncheckedCreateInput> = {},
): Promise<Reply> {
  const lead =
    overrides.leadId === null
      ? null
      : overrides.leadId === undefined
        ? await createLead(tx, { status: "CONTACTED" })
        : await tx.lead.findUniqueOrThrow({ where: { id: overrides.leadId } });
  return tx.reply.create({
    data: {
      channel: "EMAIL",
      providerMessageId: `msg-${uniqueToken()}`,
      fromAddress: uniqueEmail("prospect"),
      subject: "Re: Your homepage on mobile",
      receivedAt: FIXED_NOW,
      latestText: "Thanks, this is useful. Can we talk on Thursday?",
      matchMethod: "IN_REPLY_TO",
      classification: "INTERESTED",
      classificationSource: "AI",
      confidence: 0.93,
      slaStatus: "ON_TRACK",
      ...(lead === null
        ? {
            matchMethod: "UNMATCHED" as const,
            classification: null,
            classificationSource: null,
            slaStatus: "NONE" as const,
          }
        : {}),
      ...overrides,
      leadId: lead?.id ?? null,
      companyId: overrides.companyId ?? lead?.companyId ?? null,
    },
  });
}

export async function createReplyCorrection(
  tx: Tx,
  overrides: Input<Prisma.ReplyCorrectionUncheckedCreateInput> = {},
): Promise<ReplyCorrection> {
  const replyId = overrides.replyId ?? (await createReply(tx)).id;
  const actorId = overrides.actorId ?? (await createUser(tx, { role: "SERVICE_LEAD" })).id;
  return tx.replyCorrection.create({
    data: {
      fromClass: "OTHER",
      toClass: "QUESTION",
      note: "Asks about pricing",
      ...overrides,
      replyId,
      actorId,
    },
  });
}

export async function createInboxThread(
  tx: Tx,
  overrides: Input<Prisma.InboxThreadUncheckedCreateInput> = {},
): Promise<InboxThread> {
  const leadId = overrides.leadId ?? (await createLead(tx, { status: "REPLIED" })).id;
  return tx.inboxThread.create({
    data: { unreadCount: 1, lastInboundAt: FIXED_NOW, ...overrides, leadId },
  });
}

/** A live EMAIL suppression of a unique address (value normalised, as the compliance service stores it). */
export function buildSuppression(
  overrides: Input<Prisma.SuppressionUncheckedCreateInput> = {},
): Prisma.SuppressionUncheckedCreateInput {
  return {
    type: "EMAIL",
    value: uniqueEmail("suppressed"),
    reason: "UNSUBSCRIBE",
    source: "ONE_CLICK",
    ...overrides,
  };
}
export function createSuppression(
  tx: Tx,
  overrides: Input<Prisma.SuppressionUncheckedCreateInput> = {},
): Promise<Suppression> {
  return tx.suppression.create({ data: buildSuppression(overrides) });
}

export async function createConsentRecord(
  tx: Tx,
  overrides: Input<Prisma.ConsentRecordUncheckedCreateInput> = {},
): Promise<ConsentRecord> {
  const contactId =
    overrides.contactId === undefined ? (await createContact(tx)).id : overrides.contactId;
  const recordedById = overrides.recordedById ?? (await createUser(tx, { role: "MANAGER" })).id;
  return tx.consentRecord.create({
    data: {
      scope: "EMAIL_OUTREACH",
      method: "EMAIL_REPLY",
      evidence: "Replied asking to be contacted about a new website.",
      ...overrides,
      contactId,
      recordedById,
    },
  });
}

export async function createDataSubjectRequest(
  tx: Tx,
  overrides: Input<Prisma.DataSubjectRequestUncheckedCreateInput> = {},
): Promise<DataSubjectRequest> {
  const createdById = overrides.createdById ?? (await createUser(tx, { role: "ADMIN" })).id;
  return tx.dataSubjectRequest.create({
    data: {
      type: "EXPORT",
      subjectEmail: uniqueEmail("subject"),
      requestedBy: "The subject, by email",
      ...overrides,
      createdById,
    },
  });
}
