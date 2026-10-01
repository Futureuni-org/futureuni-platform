import "server-only";

/**
 * Provided seam SEAM-SEND-ONEOFF (wave-3 guide Part B2). Used by the inbox (replies) and pipeline
 * (proposals). It records a ONE_OFF Message that threads onto an existing conversation and sends it
 * through the single send path (step 4.6). Requires `humanConfirmedClaims: true` (INV-5): a human
 * wrote or confirmed the text, so the automatic citation check cannot vouch for it.
 */

import { SendOneOffInputSchema, type SendOneOffEmail } from "@/contracts/outreach-channel";
import type { ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { withTransaction } from "@/platform/db";

import { createMessage } from "./email.repo";
import { sendEmailMessage } from "./send";

export const sendOneOffEmail: SendOneOffEmail = async (actor, rawInput) => {
  const input = SendOneOffInputSchema.parse(rawInput);
  if (!input.humanConfirmedClaims) {
    throw new AppError("VALIDATION_FAILED", "A one-off email needs humanConfirmedClaims = true.");
  }

  const lead = await loadLeadScope(input.leadId);
  await assertActorCan(actor, "acquisition.message.sendOneOff", {
    serviceLine: lead.serviceLine,
    ownerId: lead.ownerId ?? undefined,
  });

  const now = new Date();
  const messageId = await withTransaction(async (tx) => {
    const message = await createMessage(tx, {
      leadId: lead.id,
      companyId: lead.companyId,
      contactId: input.contactId,
      kind: "ONE_OFF",
      channel: "EMAIL",
      status: "APPROVED",
      subject: input.subject,
      body: input.body,
      humanEdited: true,
      humanConfirmedClaims: true,
      ...(actor.type === "USER" ? { humanConfirmedById: actor.userId } : {}),
      humanConfirmedAt: now,
      approvedAt: now,
      ...(actor.type === "USER" ? { approvedById: actor.userId } : {}),
      ...(input.inReplyToMessageId === undefined ? {} : { inReplyToMessageId: input.inReplyToMessageId }),
    });

    if (input.attachments !== undefined && input.attachments.length > 0) {
      const { db } = await import("@/platform/db");
      for (const att of input.attachments) {
        const file = await db.fileObject.findFirst({ where: { key: att.fileKey }, select: { id: true } });
        if (file === null) throw new AppError("VALIDATION_FAILED", `Unknown attachment: ${att.filename}`);
        await tx.messageAttachment.create({ data: { messageId: message.id, fileObjectId: file.id, filename: att.filename } });
      }
    }
    return message.id;
  });

  // Send through the single path (suppression, contactability, window, mailbox, footer — same checks).
  await sendEmailMessage(messageId, { now });
  return { messageId };
};

async function loadLeadScope(leadId: string): Promise<{ id: string; companyId: string; serviceLine: ServiceLine; ownerId: string | null }> {
  const { db } = await import("@/platform/db");
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, companyId: true, serviceLine: true, ownerId: true },
  });
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  return lead;
}
