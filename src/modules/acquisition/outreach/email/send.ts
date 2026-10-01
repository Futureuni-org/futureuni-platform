import "server-only";

/**
 * The single outreach-email send path (ADR-016; outreach-channel contract rule 1). EVERY automatic
 * and one-off email goes through `sendEmailMessage`. It enforces, in order: the global pause
 * (OUTREACH_PAUSED), suppression (INV-2), contactability (INV-6/INV-25), that no cited finding has
 * been dismissed (INV-18), a non-empty postal address (INV-4), the recipient send window (INV-8),
 * and the mailbox daily cap + warm-up (INV-8). The provider send is idempotent by messageId
 * (INV-22). A compliance change or dismissed citation after approval blocks the send and returns
 * the lead APPROVED → IN_REVIEW; a suppression blocks it (the lead is already SUPPRESSED).
 *
 * The provider call happens outside any database transaction (external I/O rule).
 */

import { randomBytes } from "node:crypto";

import type { Clock } from "@/contracts/common";
import { env } from "@/env";
import { AppError, isAppError } from "@/lib/errors";
import { db, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { getSetting } from "@/platform/settings";
import { stripCitationMarkers } from "@/platform/ai";
import { getContactability } from "@/modules/acquisition/compliance";
import { isSuppressed, transitionLead } from "@/modules/acquisition/core";

import { signUnsubscribeToken } from "../unsubscribe/tokens";
import { getOutreachSetting } from "../settings";
import { addBusinessDays, buildSendWindow, nextSendSlot, resolveRecipientTimezone } from "./send-window";
import { appendFooter, buildFooter, buildOutboundEmail } from "./mime";
import { getEmailSender } from "./sender";
import {
  dismissedCitedFindingIds,
  loadMessageForSend,
  threadMailboxId,
  updateMessage,
  type MessageForSend,
} from "./email.repo";
import { pickMailbox } from "../mailboxes/rotation";
import { releaseDailySend, todayIso, tryReserveDailySend } from "../mailboxes/mailbox.repo";
import { listSequenceSteps, updateEnrollment } from "../sequences/sequences.repo";

export type SendOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "rescheduled"; at: Date; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "skipped"; reason: string };

export interface SendOptions {
  now?: Date;
}

/** A revocable token id for `Message.unsubscribeTokenId` (matches IdSchema). */
function newTokenId(): string {
  return `c${randomBytes(16).toString("hex")}`;
}

function contactName(contact: MessageForSend["contact"]): string | undefined {
  if (contact === null) return undefined;
  const full = contact.name ?? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return full === "" ? undefined : full;
}

async function senderIdentity(ownerId: string | null): Promise<{ name: string; title: string | null }> {
  if (ownerId === null) return { name: "The FUTUREUNI team", title: null };
  const user = await db.user.findUnique({ where: { id: ownerId }, select: { name: true } });
  return { name: user?.name ?? "The FUTUREUNI team", title: null };
}

/** Marks a message BLOCKED and returns the lead to review (INV: compliance/citation change after approval). */
async function blockAndReturnToReview(message: MessageForSend, reason: string): Promise<SendOutcome> {
  await withTransaction(async (tx) => {
    await updateMessage(tx, message.id, { status: "BLOCKED", blockedReason: reason });
    if (message.lead.status === "APPROVED") {
      const { event } = await transitionLead(tx, {
        leadId: message.leadId,
        to: "IN_REVIEW",
        actor: { type: "SYSTEM", job: "acquisition.outreach.send" },
        reason: `send blocked: ${reason}`,
      });
      if (event !== null) {
        await publishAfterCommit(tx, {
          name: "lead.statusChanged",
          actor: { type: "SYSTEM", job: "acquisition.outreach.send" },
          payload: {
            leadId: message.leadId,
            leadEventId: event.id,
            from: event.fromStatus,
            to: "IN_REVIEW",
            serviceLine: message.lead.serviceLine,
            market: message.lead.market,
            reason: `send blocked: ${reason}`,
          },
        });
      }
    }
  });
  return { status: "blocked", reason };
}

async function reschedule(messageId: string, at: Date, reason: string): Promise<SendOutcome> {
  await updateMessage(null, messageId, { status: "SCHEDULED", scheduledFor: at });
  return { status: "rescheduled", at, reason };
}

/** Sets the enrolment's next run time after a sequence step is sent, or completes it. */
export async function scheduleNextStep(
  tx: Tx,
  enrollmentId: string | null,
  sentStepIndex: number | null,
  sentAt: Date,
  timezone: string,
): Promise<void> {
  if (enrollmentId === null || sentStepIndex === null) return;
  const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { sequenceId: true } });
  if (enrollment === null) return;
  const steps = await listSequenceSteps(tx, enrollment.sequenceId);
  const next = steps.find((s) => s.stepIndex === sentStepIndex + 1);
  if (next === undefined) {
    await updateEnrollment(tx, enrollmentId, { status: "COMPLETED", completedAt: sentAt, nextRunAt: null });
    return;
  }
  await updateEnrollment(tx, enrollmentId, { nextRunAt: addBusinessDays(timezone, sentAt, next.delayBusinessDays) });
}

export async function sendEmailMessage(messageId: string, opts: SendOptions = {}): Promise<SendOutcome> {
  const now = opts.now ?? new Date();
  const clock: Clock = { now: () => now };

  const message = await loadMessageForSend(null, messageId);
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  if (message.channel !== "EMAIL") throw new AppError("VALIDATION_FAILED", "Only email is sent through this path.");

  // Idempotency (INV-22): a message already sent returns its first result.
  if (message.providerMessageId !== null && (message.status === "SENT" || message.status === "SENT_MOCK")) {
    return { status: "sent", providerMessageId: message.providerMessageId };
  }
  if (!["APPROVED", "SCHEDULED", "SENDING"].includes(message.status)) {
    return { status: "skipped", reason: `status ${message.status}` };
  }
  if (message.contact === null) {
    return blockAndReturnToReview(message, "NO_EMAIL");
  }
  if (message.contact.email === null) {
    return blockAndReturnToReview(message, "NO_EMAIL");
  }

  // 1. Global pause (reschedule so a resumed campaign sends later).
  if (await getOutreachSetting("globalPause")) {
    return reschedule(messageId, new Date(now.getTime() + 60 * 60 * 1000), "OUTREACH_PAUSED");
  }

  // 2. Suppression (INV-2) — the lead is already SUPPRESSED via the cascade; just refuse.
  const email = message.contact.email;
  const domain = message.company.normalizedDomain;
  const suppressed = await isSuppressed(null, {
    email,
    ...(message.contact.phone === null ? {} : { phone: message.contact.phone }),
    ...(domain === null ? {} : { domain }),
  });
  if (suppressed) {
    await updateMessage(null, messageId, { status: "BLOCKED", blockedReason: "SUPPRESSED" });
    return { status: "blocked", reason: "SUPPRESSED" };
  }

  // 3. Contactability (INV-6, INV-25).
  const contactability = await getContactability(null, { companyId: message.companyId, contactId: message.contact.id });
  if (contactability.email.status !== "ALLOWED") {
    return blockAndReturnToReview(message, `EMAIL_${contactability.email.status}`);
  }

  // 4. No dismissed cited finding (INV-18).
  const dismissed = await dismissedCitedFindingIds(null, messageId);
  if (dismissed.length > 0) return blockAndReturnToReview(message, "CITATION_INVALID");

  // 5. Postal address present (INV-4).
  const postalAddress = await getSetting<string>("platform.postalAddress").catch(() => "");
  if (postalAddress.trim() === "") {
    return reschedule(messageId, new Date(now.getTime() + 60 * 60 * 1000), "NO_POSTAL_ADDRESS");
  }

  // 6. Send window in the recipient's timezone (INV-8).
  const timezone = resolveRecipientTimezone({ country: message.company.country, city: message.company.city, region: message.company.region });
  const window = buildSendWindow({
    timezone,
    start: await getOutreachSetting("sendWindowStart"),
    end: await getOutreachSetting("sendWindowEnd"),
    jitterMinutes: await getOutreachSetting("sendWindowJitterMinutes"),
  });
  const slot = nextSendSlot(window, now);
  if (slot.getTime() > now.getTime() + 1000) {
    return reschedule(messageId, slot, "OUTSIDE_SEND_WINDOW");
  }

  // 7. Pick a mailbox under cap, keeping thread affinity (INV-8).
  const preferred = message.enrollment?.mailboxId ?? message.mailboxId ?? (await threadMailboxId(null, message.leadId));
  const pick = await pickMailbox(null, now, preferred);
  if (pick === null) {
    const nextDay = nextSendSlot(window, new Date(now.getTime() + 60 * 60 * 1000));
    return reschedule(messageId, nextDay, "MAILBOX_CAP_REACHED");
  }
  const mailbox = pick.mailbox;
  const dayIso = todayIso(now);

  // 8. Build the MIME with the system footer and RFC 8058 headers (INV-4).
  const tokenId = message.unsubscribeTokenId ?? newTokenId();
  const scope = await getOutreachSetting("unsubscribeScope");
  const token = signUnsubscribeToken({ v: 1, tid: tokenId, mid: message.id, cid: message.contact.id, scope });
  const unsubscribeUrl = `${env.NEXT_PUBLIC_APP_URL}/u/${token}`;
  const sender = await senderIdentity(message.lead.ownerId);
  const footer = buildFooter({ senderName: sender.name, senderTitle: sender.title, unsubscribeUrl, postalAddress });
  const text = appendFooter(stripCitationMarkers(message.body), footer);

  const subject = message.subject ?? (await threadSubject(message.leadId)) ?? "Following up";
  const toName = contactName(message.contact);
  const threading = await threadingHeaders(message);

  const outbound = buildOutboundEmail({
    messageId: message.id,
    from: { address: mailbox.address, name: `${sender.name} at FUTUREUNI` },
    to: toName === undefined ? { address: email } : { address: email, name: toName },
    subject,
    text,
    unsubscribeUrl,
    inReplyTo: threading.inReplyTo,
    references: threading.references,
    providerThreadId: threading.providerThreadId,
  });

  // 9. Reserve one send against today's cap (atomic; INV-8).
  const reserved = await withTransaction((tx) => tryReserveDailySend(tx, mailbox.id, dayIso, pick.cap));
  if (!reserved) {
    const nextDay = nextSendSlot(window, new Date(now.getTime() + 60 * 60 * 1000));
    return reschedule(messageId, nextDay, "MAILBOX_CAP_REACHED");
  }

  // 10. Send through the adapter (idempotency key = messageId, INV-22).
  await updateMessage(null, messageId, { status: "SENDING", mailboxId: mailbox.id });
  const senderAdapter = getEmailSender();
  let result;
  try {
    result = await senderAdapter.send(outbound, {
      mailboxId: mailbox.id,
      credentialProvider: mailbox.credentialProvider as `outreach-mailbox:${string}`,
      clock,
    });
  } catch (error) {
    await withTransaction(async (tx) => {
      await releaseDailySend(tx, mailbox.id, dayIso);
      await updateMessage(tx, messageId, { status: "SCHEDULED" });
    });
    throw isAppError(error) ? error : new AppError("PROVIDER_ERROR", "Outreach send failed.");
  }

  // 11. Persist the result, advance the thread, transition on first touch, emit the event.
  await withTransaction(async (tx) => {
    await updateMessage(tx, messageId, {
      status: "SENT",
      providerMessageId: result.providerMessageId,
      ...(result.providerThreadId === undefined ? {} : { providerThreadId: result.providerThreadId }),
      rfcMessageId: result.rfcMessageId,
      mailboxId: mailbox.id,
      sentAt: now,
      unsubscribeTokenId: tokenId,
      footerSnapshot: footer,
    });

    if (message.enrollmentId !== null) {
      await updateEnrollment(tx, message.enrollmentId, {
        ...(message.enrollment?.mailboxId == null ? { mailboxId: mailbox.id } : {}),
      });
      await scheduleNextStep(tx, message.enrollmentId, message.stepIndex, now, timezone);
    }

    if (message.lead.status === "APPROVED") {
      const { event } = await transitionLead(tx, {
        leadId: message.leadId,
        to: "CONTACTED",
        actor: { type: "SYSTEM", job: "acquisition.outreach.send" },
        reason: "first touch sent",
      });
      if (event !== null) {
        await publishAfterCommit(tx, {
          name: "lead.statusChanged",
          actor: { type: "SYSTEM", job: "acquisition.outreach.send" },
          payload: {
            leadId: message.leadId,
            leadEventId: event.id,
            from: event.fromStatus,
            to: "CONTACTED",
            serviceLine: message.lead.serviceLine,
            market: message.lead.market,
            reason: "first touch sent",
          },
        });
      }
    }

    await publishAfterCommit(tx, {
      name: "outreach.step.sent",
      actor: { type: "SYSTEM", job: "acquisition.outreach.send" },
      payload: {
        messageId: message.id,
        leadId: message.leadId,
        enrollmentId: message.enrollmentId,
        channel: "EMAIL",
        stepIndex: message.stepIndex,
      },
    });
  });

  return { status: "sent", providerMessageId: result.providerMessageId };
}

async function threadSubject(leadId: string): Promise<string | null> {
  const first = await db.message.findFirst({
    where: { leadId, subject: { not: null }, status: { in: ["SENT", "SENT_MOCK"] } },
    orderBy: { createdAt: "asc" },
    select: { subject: true },
  });
  return first?.subject ?? null;
}

async function threadingHeaders(
  message: MessageForSend,
): Promise<{ inReplyTo: string | null; references: string[]; providerThreadId: string | null }> {
  // One-off replies thread onto a specific message.
  if (message.inReplyToMessageId !== null) {
    const parent = await db.message.findUnique({
      where: { id: message.inReplyToMessageId },
      select: { rfcMessageId: true, providerThreadId: true },
    });
    if (parent !== null) {
      return {
        inReplyTo: parent.rfcMessageId,
        references: [],
        providerThreadId: parent.providerThreadId,
      };
    }
  }
  if (message.stepIndex === null || message.stepIndex === 0) {
    return { inReplyTo: null, references: [], providerThreadId: null };
  }
  const prior = await db.message.findMany({
    where: { leadId: message.leadId, status: { in: ["SENT", "SENT_MOCK"] }, rfcMessageId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { rfcMessageId: true, providerThreadId: true },
  });
  if (prior.length === 0) return { inReplyTo: null, references: [], providerThreadId: null };
  const rfcIds = prior.flatMap((m) => (m.rfcMessageId === null ? [] : [m.rfcMessageId]));
  // mime appends the parent (inReplyTo) to `references`, so pass the ancestors without it.
  const inReplyTo = rfcIds[rfcIds.length - 1] ?? null;
  const references = rfcIds.slice(0, -1);
  return {
    inReplyTo,
    references,
    providerThreadId: prior.find((m) => m.providerThreadId !== null)?.providerThreadId ?? null,
  };
}
