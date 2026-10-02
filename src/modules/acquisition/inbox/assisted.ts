import "server-only";

/**
 * Assisted-channel replies (module spec §3.12, prompt step 6). A human pastes a WhatsApp, LinkedIn
 * or phone reply; it is stored as a `Reply` on the lead and run through the same classification and
 * actions. WhatsApp and LinkedIn are never read automatically (INV-7); this is the only way they
 * enter the inbox.
 */

import { z } from "zod";

import type { Actor, Clock } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

import { stripQuotesAndSignature } from "./normalize";
import { createReply, getLeadForProcessing, touchInboxThreadInbound } from "./inbox.repo";
import { processReply } from "./actions/process";

export const LogAssistedReplyInputSchema = z.object({
  leadId: z.string().min(1),
  channel: z.enum(["WHATSAPP", "LINKEDIN", "PHONE"]),
  text: z.string().min(1).max(12_000),
  receivedAt: z.date().optional(),
});
export type LogAssistedReplyInput = z.infer<typeof LogAssistedReplyInputSchema>;

/** Logs a pasted assisted-channel reply and classifies/actions it the same way as an email. */
export async function logAssistedReply(actor: Actor, raw: LogAssistedReplyInput, clock?: Clock): Promise<{ replyId: string }> {
  const input = LogAssistedReplyInputSchema.parse(raw);
  const lead = await getLeadForProcessing(input.leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.inbox.logAssisted", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });

  const receivedAt = input.receivedAt ?? clock?.now() ?? new Date();
  const latestText = stripQuotesAndSignature(input.text);

  const created = await withTransaction(async (tx) => {
    const reply = await createReply({
      mailboxId: null,
      leadId: lead.id,
      contactId: lead.primaryContactId,
      companyId: lead.companyId,
      messageId: null,
      channel: input.channel,
      providerMessageId: null,
      providerThreadId: null,
      rfcMessageId: null,
      inReplyTo: null,
      references: [],
      fromAddress: null,
      toAddress: null,
      subject: null,
      receivedAt,
      headers: null,
      rawBodySanitized: input.text,
      latestText,
      attachmentsMeta: null,
      matchMethod: "MANUAL",
      loggedById: actor.type === "USER" ? actor.userId : null,
    });
    await touchInboxThreadInbound(tx, lead.id, receivedAt);
    await audit.record(tx, {
      actor,
      action: "acquisition.inbox.logAssisted",
      targetType: "Reply",
      targetId: reply.id,
      after: { leadId: lead.id, channel: input.channel },
    });
    return reply;
  });

  await processReply(created.id, { now: () => receivedAt });
  return { replyId: created.id };
}
