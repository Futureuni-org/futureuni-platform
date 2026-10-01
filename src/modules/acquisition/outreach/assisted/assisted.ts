import "server-only";

/**
 * Assisted channels (step 5): WhatsApp, LinkedIn and call tasks. A human always performs the final
 * send (INV-7) — nothing here calls a WhatsApp or LinkedIn API. Suppression, contactability and the
 * global pause are checked before any link or task is prepared; `markAssistedSent` records the
 * human's send and transitions a first touch to CONTACTED.
 */

import type { Actor, Market, ServiceLine } from "@/contracts/common";
import type { AssistedOutcome } from "@/contracts/outreach-channel";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { db, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { stripCitationMarkers } from "@/platform/ai";
import { getContactability } from "@/modules/acquisition/compliance";
import { isSuppressed, transitionLead } from "@/modules/acquisition/core";

import { getOutreachSetting } from "../settings";
import { resolveRecipientTimezone } from "../email/send-window";
import { scheduleNextStep } from "../email/send";
import { buildWhatsAppLink } from "./links";

interface AssistedMessage {
  id: string;
  leadId: string;
  companyId: string;
  contactId: string | null;
  channel: string;
  status: string;
  stepIndex: number | null;
  enrollmentId: string | null;
  subject: string | null;
  body: string;
  lead: { status: string; serviceLine: ServiceLine; market: Market; ownerId: string | null };
  company: { country: string | null; city: string | null; region: string | null; name: string };
  contact: { phone: string | null; whatsappStatus: string; linkedinUrl: string | null; email: string | null } | null;
}

async function loadAssistedMessage(messageId: string): Promise<AssistedMessage> {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: {
      id: true, leadId: true, companyId: true, contactId: true, channel: true, status: true,
      stepIndex: true, enrollmentId: true, subject: true, body: true,
      lead: { select: { status: true, serviceLine: true, market: true, ownerId: true } },
      company: { select: { country: true, city: true, region: true, name: true } },
      contact: { select: { phone: true, whatsappStatus: true, linkedinUrl: true, email: true } },
    },
  });
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  return message;
}

/** Shared pre-send checks for an assisted channel (global pause, suppression, contactability). */
async function assertAssistedAllowed(message: AssistedMessage, channel: "whatsapp" | "linkedin" | "phone"): Promise<void> {
  if (await getOutreachSetting("globalPause")) throw new AppError("OUTREACH_PAUSED", "Outreach is paused.");
  if (message.contact === null) throw new AppError("VALIDATION_FAILED", "The message has no contact.");

  const suppressed = await isSuppressed(null, {
    ...(message.contact.email === null ? {} : { email: message.contact.email }),
    ...(message.contact.phone === null ? {} : { phone: message.contact.phone }),
  });
  if (suppressed) throw new AppError("SUPPRESSED", "This contact is suppressed.");

  const contactability = await getContactability(null, { companyId: message.companyId, ...(message.contactId === null ? {} : { contactId: message.contactId }) });
  const verdict = channel === "whatsapp" ? contactability.whatsapp : channel === "linkedin" ? contactability.linkedin : contactability.phone;
  if (verdict.status === "BLOCKED") throw new AppError("CONTACT_BLOCKED", `This contact cannot be reached on ${channel}.`);
}

export interface WhatsAppPrepared {
  messageId: string;
  url: string;
  text: string;
}

export async function prepareWhatsApp(actor: Actor, messageId: string): Promise<WhatsAppPrepared> {
  const message = await loadAssistedMessage(messageId);
  await assertActorCan(actor, "acquisition.message.sendAssisted", {
    serviceLine: message.lead.serviceLine,
    ownerId: message.lead.ownerId ?? undefined,
  });
  if (message.channel !== "WHATSAPP_ASSISTED") throw new AppError("VALIDATION_FAILED", "Not a WhatsApp message.");
  await assertAssistedAllowed(message, "whatsapp");

  const phone = message.contact?.phone;
  if (phone === null || phone === undefined || phone === "") {
    throw new AppError("VALIDATION_FAILED", "The contact has no phone number.");
  }
  const status = message.contact?.whatsappStatus;
  if (status !== "CONFIRMED" && status !== "LIKELY") {
    throw new AppError("CONTACT_BLOCKED", "No confirmed or likely WhatsApp number.");
  }

  const text = stripCitationMarkers(message.body);
  const url = buildWhatsAppLink({ text, to: phone });
  await db.message.update({ where: { id: messageId }, data: { status: "PREPARED" } });
  return { messageId, url, text };
}

export interface LinkedInPrepared {
  messageId: string;
  text: string;
  companyPageUrl: string;
}

export async function prepareLinkedIn(actor: Actor, messageId: string): Promise<LinkedInPrepared> {
  const message = await loadAssistedMessage(messageId);
  await assertActorCan(actor, "acquisition.message.sendAssisted", {
    serviceLine: message.lead.serviceLine,
    ownerId: message.lead.ownerId ?? undefined,
  });
  if (message.channel !== "LINKEDIN_ASSISTED") throw new AppError("VALIDATION_FAILED", "Not a LinkedIn message.");
  await assertAssistedAllowed(message, "linkedin");

  const companyPageUrl = message.contact?.linkedinUrl;
  if (companyPageUrl === null || companyPageUrl === undefined || companyPageUrl === "") {
    throw new AppError("VALIDATION_FAILED", "No LinkedIn URL for this contact.");
  }
  const text = stripCitationMarkers(message.body);
  await db.message.update({ where: { id: messageId }, data: { status: "PREPARED" } });
  return { messageId, text, companyPageUrl };
}

export interface CallTask {
  messageId: string;
  phone: string;
  talkingPoints: string[];
}

export async function createCallTask(actor: Actor, messageId: string): Promise<CallTask> {
  const message = await loadAssistedMessage(messageId);
  await assertActorCan(actor, "acquisition.message.sendAssisted", {
    serviceLine: message.lead.serviceLine,
    ownerId: message.lead.ownerId ?? undefined,
  });
  await assertAssistedAllowed(message, "phone");

  const phone = message.contact?.phone;
  if (phone === null || phone === undefined || phone === "") {
    throw new AppError("VALIDATION_FAILED", "The contact has no phone number.");
  }
  const talkingPoints = stripCitationMarkers(message.body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 6);
  await db.message.update({ where: { id: messageId }, data: { status: "PREPARED" } });
  return { messageId, phone, talkingPoints: talkingPoints.length > 0 ? talkingPoints : ["Introduce FUTUREUNI and the reason for the call."] };
}

export interface MarkAssistedSentInput {
  sentAt: Date;
  note?: string;
  callOutcome?: AssistedOutcome["callOutcome"];
}

/** Records that a human sent an assisted message (status SENT_ASSISTED); a first touch → CONTACTED. */
export async function markAssistedSent(actor: Actor, messageId: string, input: MarkAssistedSentInput): Promise<void> {
  const message = await loadAssistedMessage(messageId);
  await assertActorCan(actor, "acquisition.message.sendAssisted", {
    serviceLine: message.lead.serviceLine,
    ownerId: message.lead.ownerId ?? undefined,
  });
  if (message.contactId === null) throw new AppError("VALIDATION_FAILED", "The message has no contact.");

  const channel = message.channel as AssistedOutcome["channel"];
  const outcome: AssistedOutcome = {
    channel,
    sentAt: input.sentAt.toISOString(),
    sentById: actor.type === "USER" ? actor.userId : message.lead.ownerId ?? messageId,
    ...(input.callOutcome === undefined ? {} : { callOutcome: input.callOutcome }),
    ...(input.note === undefined ? {} : { note: input.note }),
  };
  const timezone = resolveRecipientTimezone({ country: message.company.country, city: message.company.city, region: message.company.region });

  await withTransaction(async (tx: Tx) => {
    await tx.message.update({
      where: { id: messageId },
      data: {
        status: "SENT_ASSISTED",
        sentAt: input.sentAt,
        ...(actor.type === "USER" ? { sentById: actor.userId } : {}),
        assistedOutcome: outcome,
      },
    });

    if (message.enrollmentId !== null) {
      await scheduleNextStep(tx, message.enrollmentId, message.stepIndex, input.sentAt, timezone);
    }

    if (message.lead.status === "APPROVED") {
      const { event } = await transitionLead(tx, {
        leadId: message.leadId,
        to: "CONTACTED",
        actor,
        reason: "first touch sent (assisted)",
      });
      if (event !== null) {
        await publishAfterCommit(tx, {
          name: "lead.statusChanged",
          actor,
          payload: {
            leadId: message.leadId,
            leadEventId: event.id,
            from: event.fromStatus,
            to: "CONTACTED",
            serviceLine: message.lead.serviceLine,
            market: message.lead.market,
            reason: "first touch sent (assisted)",
          },
        });
      }
    }

    await publishAfterCommit(tx, {
      name: "outreach.step.sent",
      actor,
      payload: {
        messageId: message.id,
        leadId: message.leadId,
        enrollmentId: message.enrollmentId,
        channel: channel,
        stepIndex: message.stepIndex,
      },
    });
  });
}
