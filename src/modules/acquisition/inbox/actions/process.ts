import "server-only";

/**
 * Reply processing orchestration (job `acquisition.inbox.process`). Loads a stored reply, builds
 * classification context, classifies it (deterministic then model), and applies the class actions.
 * Idempotent: a reply with `processedAt` set is skipped, so a retried job never double-acts.
 * `reclassify` re-runs the actions for a human-chosen class and records a `ReplyCorrection`.
 */

import type { Actor, Clock, ReplyClass } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { stripCitationMarkers } from "@/platform/ai";
import { assertActorCan } from "@/platform/auth";
import { withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";

import { inboxLog } from "../_shared";
import { classifyReply, type ClassifyResult } from "../classify/classify";
import { getInboxSetting, getUnsubscribeScope } from "../settings";
import {
  createReplyCorrection,
  getLeadForProcessing,
  getReplyRow,
  getThreadContext,
  updateReplyClassification,
} from "../inbox.repo";
import { applyReplyActions, type InboxSettingsBundle, type ProcessingReply } from "./actions";

const PROCESS_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.inbox.process" };

function recipientTimezone(market: string): string {
  return market === "NIGERIA" ? "Africa/Lagos" : "Europe/London";
}

async function loadSettings(): Promise<InboxSettingsBundle> {
  const [slaBusinessHours, defaultNurtureDays, outOfOfficeFallbackDays, unsubscribeScope] = await Promise.all([
    getInboxSetting("slaBusinessHours"),
    getInboxSetting("defaultNurtureDays"),
    getInboxSetting("outOfOfficeFallbackDays"),
    getUnsubscribeScope(),
  ]);
  return { slaBusinessHours, defaultNurtureDays, outOfOfficeFallbackDays, unsubscribeScope };
}

export async function processReply(replyId: string, clock: Clock): Promise<{ status: "processed" | "skipped" | "unmatched" | "gone" }> {
  const reply = await getReplyRow(replyId);
  if (reply === null) return { status: "gone" };
  if (reply.processedAt !== null) return { status: "skipped" };

  const now = clock.now();

  if (reply.leadId === null) {
    await withTransaction(async (tx) => {
      await updateReplyClassification(tx, replyId, {
        needsHumanReview: true,
        summary: reply.latestText.slice(0, 160),
        processedAt: now,
      });
      await publishAfterCommit(tx, {
        name: "reply.received",
        actor: PROCESS_ACTOR,
        payload: { replyId, leadId: null, channel: reply.channel, matched: false },
      });
    });
    return { status: "unmatched" };
  }

  const lead = await getLeadForProcessing(reply.leadId);
  if (lead === null) {
    await withTransaction((tx) => updateReplyClassification(tx, replyId, { processedAt: now, needsHumanReview: true }));
    return { status: "gone" };
  }

  const settings = await loadSettings();
  const tz = recipientTimezone(lead.market);
  const thread = await getThreadContext(lead.id);
  const last = thread.at(-1);
  const originalMessage = last === undefined ? null : { subject: last.subject, text: stripCitationMarkers(last.body).slice(0, 8_000) };

  const confidenceThreshold = await getInboxSetting("confidenceThreshold");
  const result = await classifyReply(
    {
      headers: (reply.headers as Record<string, string> | null) ?? {},
      fromAddress: reply.fromAddress,
      toAddress: reply.toAddress,
      subject: reply.subject,
      latestText: reply.latestText,
      rawBodySanitized: reply.rawBodySanitized,
    },
    { serviceLine: lead.serviceLine, market: lead.market, recipientTimezone: tz, receivedAt: reply.receivedAt, fromName: null, subject: reply.subject, originalMessage },
    PROCESS_ACTOR,
    confidenceThreshold,
  );

  const processing: ProcessingReply = {
    id: reply.id,
    companyId: lead.companyId,
    contactId: reply.contactId,
    messageId: reply.messageId,
    fromAddress: reply.fromAddress,
    subject: reply.subject,
    latestText: reply.latestText,
    channel: reply.channel,
  };
  await applyReplyActions(processing, lead, result, settings, PROCESS_ACTOR, clock, tz);
  return { status: "processed" };
}

/** Human reclassification: re-runs the actions for `newClass` and records a correction (idempotent). */
export async function reclassify(actor: Actor, replyId: string, newClass: ReplyClass, note: string | null, clock?: Clock): Promise<void> {
  const reply = await getReplyRow(replyId);
  if (reply === null) throw new AppError("NOT_FOUND", "Reply not found.");
  if (reply.leadId === null) throw new AppError("NOT_FOUND", "Reply is not linked to a lead.");
  const lead = await getLeadForProcessing(reply.leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.inbox.reclassify", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });

  const settings = await loadSettings();
  const tz = recipientTimezone(lead.market);
  const now = clock?.now() ?? new Date();

  const referral =
    reply.referral !== null && typeof reply.referral === "object"
      ? (reply.referral as { name: string | null; email: string | null; role: string | null })
      : null;

  const result: ClassifyResult = {
    classification: newClass,
    source: "HUMAN",
    confidence: 1,
    followUpDate: reply.followUpDate === null ? null : reply.followUpDate.toISOString().slice(0, 10),
    referral,
    objectionSummary: reply.objectionSummary,
    questions: reply.questions,
    sentiment: reply.sentiment === "positive" || reply.sentiment === "negative" ? reply.sentiment : "neutral",
    language: reply.language ?? "en",
    summary: reply.summary ?? `Reclassified as ${newClass}`,
    needsHumanReview: false,
    aiCallId: null,
    bounce: null,
    returnDateText: null,
  };

  await withTransaction((tx) =>
    createReplyCorrection(tx, {
      replyId,
      fromClass: reply.classification,
      toClass: newClass,
      note,
      actorId: actor.type === "USER" ? actor.userId : "",
    }),
  );

  const clockLike: Clock = { now: () => now };
  await applyReplyActions(
    { id: reply.id, companyId: lead.companyId, contactId: reply.contactId, messageId: reply.messageId, fromAddress: reply.fromAddress, subject: reply.subject, latestText: reply.latestText, channel: reply.channel },
    lead,
    result,
    settings,
    actor,
    clockLike,
    tz,
  );
  inboxLog.info("reply reclassified", { replyId, toClass: newClass });
}
