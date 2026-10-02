import "server-only";

/**
 * Per-class reply actions (module spec §3.12, prompt step 3). Every reply first stops the company's
 * enrolments (INV-3) — except OUT_OF_OFFICE (pauses) and BOUNCE/UNSUBSCRIBE (their own services stop)
 * — then the class action runs, in one transaction where possible. Services that manage their own
 * transaction (`addSuppression`, `proposeEnrollment`) run around the main transaction. Reply always
 * stops automatic sending; an unsubscribe is honoured immediately and never answered (INV-23).
 */

import { addDays } from "date-fns";

import type { Actor, Clock } from "@/contracts/common";
import type { Prisma, Tx } from "@/platform/db";
import { withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import {
  canTransition,
  LEAD_CLOSED_STATUSES,
  normalizeSuppressionValue,
  transitionLead,
} from "@/modules/acquisition/core";
import {
  pauseEnrollment,
  proposeEnrollment,
  recordBounce,
  stopEnrollments,
} from "@/modules/acquisition/outreach";
import { getContactability } from "@/modules/acquisition/compliance";
import { getEmailVerifier } from "@/modules/acquisition/enrichment";
import { audit } from "@/platform/audit-log";
import { emailDomain, normalizeDomain, normalizeEmail, upsertContact } from "@/platform/directory";

import { inboxLog, publishStatusChanged } from "../_shared";
import type { ClassifyResult } from "../classify/classify";
import { resolveFollowUpDate } from "../classify/follow-up";
import { applyRouting } from "../routing/routing";
import {
  appendReplyActions,
  findOpenLeadIdsForCompany,
  getMinimalLead,
  insertSuppression,
  setLeadNextAction,
  updateReplyClassification,
  type LeadProcessingRow,
} from "../inbox.repo";
import { generateReplyDraft } from "../draft/draft";

const WEBMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

export interface InboxSettingsBundle {
  slaBusinessHours: number;
  defaultNurtureDays: number;
  outOfOfficeFallbackDays: number;
  unsubscribeScope: "COMPANY" | "CONTACT";
}

export interface ProcessingReply {
  id: string;
  companyId: string;
  contactId: string | null;
  messageId: string | null;
  fromAddress: string | null;
  subject: string | null;
  latestText: string;
  channel: "EMAIL" | "WHATSAPP" | "LINKEDIN" | "PHONE";
}

/** Applies the class-specific actions for a classified, matched reply. */
export async function applyReplyActions(
  reply: ProcessingReply,
  lead: LeadProcessingRow,
  result: ClassifyResult,
  settings: InboxSettingsBundle,
  actor: Actor,
  clock: Clock,
  recipientTimezone: string,
): Promise<void> {
  const now = clock.now();

  if ((LEAD_CLOSED_STATUSES as readonly string[]).includes(lead.status)) {
    // A late reply on a closed lead: record and classify, take no lifecycle action.
    await withTransaction(async (tx) => {
      await storeClassification(tx, reply.id, result, now, {});
      await publishReplyEvents(tx, reply, lead, result, actor);
    });
    return;
  }

  switch (result.classification) {
    case "BOUNCE":
      await handleBounce(reply, lead, result, actor, now);
      return;
    case "OUT_OF_OFFICE":
      await handleOutOfOffice(reply, lead, result, settings, actor, now);
      return;
    case "UNSUBSCRIBE":
      await handleUnsubscribe(reply, lead, result, settings, actor, now);
      return;
    case "NOT_NOW":
      await handleNotNow(reply, lead, result, settings, actor, now, recipientTimezone);
      break;
    case "WRONG_PERSON":
      await handleWrongPerson(reply, lead, result, actor, now);
      break;
    default:
      await handleConversational(reply, lead, result, settings, actor, now);
      break;
  }
}

// ---- Class handlers ----

async function handleBounce(reply: ProcessingReply, lead: LeadProcessingRow, result: ClassifyResult, actor: Actor, now: Date): Promise<void> {
  await withTransaction(async (tx) => {
    if (result.bounce !== null) {
      await recordBounce(tx, {
        ...(reply.messageId === null ? {} : { messageId: reply.messageId }),
        email: result.bounce.email,
        kind: result.bounce.kind,
        detail: (reply.subject ?? "Delivery failure").slice(0, 500),
      });
    }
    await storeClassification(tx, reply.id, result, now, {});
    await appendReplyActions(tx, reply.id, [{ action: "BOUNCE_RECORDED", at: now.toISOString(), detail: result.bounce?.kind ?? "bounce" }]);
    await publishReplyEvents(tx, reply, lead, result, actor);
  });
}

async function handleOutOfOffice(
  reply: ProcessingReply,
  lead: LeadProcessingRow,
  result: ClassifyResult,
  settings: InboxSettingsBundle,
  actor: Actor,
  now: Date,
): Promise<void> {
  const until = outOfOfficeUntil(result.returnDateText, now, settings.outOfOfficeFallbackDays);
  await withTransaction(async (tx) => {
    await pauseEnrollment(tx, lead.id, until, "OUT_OF_OFFICE");
    await storeClassification(tx, reply.id, result, now, {});
    await appendReplyActions(tx, reply.id, [
      { action: "SEQUENCE_PAUSED", at: now.toISOString(), detail: `Paused until ${until.toISOString().slice(0, 10)} (out of office)` },
    ]);
    await publishReplyEvents(tx, reply, lead, result, actor);
  });
}

async function handleUnsubscribe(
  reply: ProcessingReply,
  lead: LeadProcessingRow,
  result: ClassifyResult,
  settings: InboxSettingsBundle,
  actor: Actor,
  now: Date,
): Promise<void> {
  // The INV-2/INV-3/INV-23 suppression cascade runs directly (an actor-less trusted path), mirroring
  // Phase 12's unsubscribe/bounce handling (phases/12/REQUESTS.md CR-12-04). It suppresses the
  // sender's email (and the company domain for a COMPANY-scope unsubscribe, skipping webmail), stops
  // every enrolment at the company, and moves the company's open leads to SUPPRESSED.
  const email = reply.fromAddress === null ? null : normalizeSuppressionValue("EMAIL", reply.fromAddress) ?? reply.fromAddress.toLowerCase();

  await withTransaction(async (tx) => {
    let suppressionId: string | null = null;
    if (email !== null) {
      suppressionId = await insertSuppression(tx, { type: "EMAIL", value: email, reason: "UNSUBSCRIBE", source: "REPLY" });
      const domain = normalizeDomain(emailDomain(email) ?? "");
      if (settings.unsubscribeScope === "COMPANY" && domain !== null && !WEBMAIL_DOMAINS.has(domain)) {
        await insertSuppression(tx, { type: "DOMAIN", value: domain, reason: "UNSUBSCRIBE", source: "REPLY" });
      }
    }

    const { stopped } = await stopEnrollments(tx, { companyId: lead.companyId }, "UNSUBSCRIBE");

    const openLeadIds = await findOpenLeadIdsForCompany(tx, lead.companyId);
    for (const openId of openLeadIds) {
      const row = openId === lead.id ? lead : await getMinimalLead(tx, openId);
      if (row === null || !canTransition(row.status, "SUPPRESSED")) continue;
      const { event } = await transitionLead(tx, { leadId: openId, to: "SUPPRESSED", actor, reason: "unsubscribe" });
      await publishStatusChanged(tx, actor, event, { leadId: openId, serviceLine: row.serviceLine, market: row.market }, "unsubscribe");
    }

    await audit.record(tx, {
      actor,
      action: "acquisition.suppression.add",
      targetType: "Reply",
      targetId: reply.id,
      after: { reason: "UNSUBSCRIBE", source: "REPLY", scope: settings.unsubscribeScope },
    });

    await storeClassification(tx, reply.id, result, now, {});
    await appendReplyActions(tx, reply.id, [
      { action: "SUPPRESSED", at: now.toISOString(), detail: "Unsubscribe honoured" },
      { action: "STATUS_CHANGED", at: now.toISOString(), detail: "SUPPRESSED" },
    ]);
    await publishReplyEvents(tx, reply, lead, result, actor);
    if (suppressionId !== null) {
      await publishAfterCommit(tx, {
        name: "compliance.suppressed",
        actor,
        payload: { suppressionId, type: "EMAIL", affectedLeadIds: openLeadIds, stoppedEnrollments: stopped },
      });
    }
  });
}


async function handleNotNow(
  reply: ProcessingReply,
  lead: LeadProcessingRow,
  result: ClassifyResult,
  settings: InboxSettingsBundle,
  actor: Actor,
  now: Date,
  recipientTimezone: string,
): Promise<void> {
  const nextActionAt = resolveFollowUpDate(result.followUpDate, now, recipientTimezone, settings.defaultNurtureDays);
  await withTransaction(async (tx) => {
    await stopEnrollments(tx, { companyId: lead.companyId }, "REPLY");
    if (canTransition(lead.status, "NURTURE", { nurtureReason: "NOT_NOW", firstContactedAt: new Date() })) {
      const { event } = await transitionLead(tx, { leadId: lead.id, to: "NURTURE", actor, nurtureReason: "NOT_NOW", meta: { replyId: reply.id } });
      await publishStatusChanged(tx, actor, event, { leadId: lead.id, serviceLine: lead.serviceLine, market: lead.market }, "not_now");
    }
    await setLeadNextAction(tx, lead.id, nextActionAt);
    await storeClassification(tx, reply.id, result, now, { followUpDate: nextActionAt });
    await appendReplyActions(tx, reply.id, [
      { action: "SEQUENCE_STOPPED", at: now.toISOString() },
      { action: "NURTURED", at: now.toISOString(), detail: `Follow up on ${nextActionAt.toISOString().slice(0, 10)}` },
    ]);
    await publishReplyEvents(tx, reply, lead, result, actor);
  });
  await bestEffortDraft(reply, lead, result, actor);
}

async function handleWrongPerson(reply: ProcessingReply, lead: LeadProcessingRow, result: ClassifyResult, actor: Actor, now: Date): Promise<void> {
  await withTransaction(async (tx) => {
    await stopEnrollments(tx, { companyId: lead.companyId }, "REPLY");
    await transitionToReplied(tx, lead, actor);
    await storeClassification(tx, reply.id, result, now, {});
    await appendReplyActions(tx, reply.id, [{ action: "SEQUENCE_STOPPED", at: now.toISOString() }, { action: "STATUS_CHANGED", at: now.toISOString(), detail: "REPLIED" }]);
    await publishReplyEvents(tx, reply, lead, result, actor);
  });
  await handleReferral(reply, lead, result, actor, now);
  await bestEffortDraft(reply, lead, result, actor);
}

async function handleConversational(
  reply: ProcessingReply,
  lead: LeadProcessingRow,
  result: ClassifyResult,
  settings: InboxSettingsBundle,
  actor: Actor,
  now: Date,
): Promise<void> {
  await withTransaction(async (tx) => {
    await stopEnrollments(tx, { companyId: lead.companyId }, "REPLY");
    await transitionToReplied(tx, lead, actor);
    const ownerId = await applyRouting(tx, actor, {
      leadId: lead.id,
      serviceLine: lead.serviceLine,
      market: lead.market,
      currentOwnerId: lead.ownerId,
      replyId: reply.id,
      classification: result.classification,
      receivedAt: now,
      slaBusinessHours: settings.slaBusinessHours,
    });
    await storeClassification(tx, reply.id, result, now, {});
    await appendReplyActions(tx, reply.id, [
      { action: "SEQUENCE_STOPPED", at: now.toISOString() },
      { action: "STATUS_CHANGED", at: now.toISOString(), detail: "REPLIED" },
      ...(ownerId !== null ? [{ action: "OWNER_NOTIFIED" as const, at: now.toISOString() }] : []),
    ]);
    await publishReplyEvents(tx, reply, lead, result, actor);
  });
  await bestEffortDraft(reply, lead, result, actor);
}

// ---- Shared steps ----

async function transitionToReplied(tx: Tx, lead: LeadProcessingRow, actor: Actor): Promise<void> {
  if (!canTransition(lead.status, "REPLIED")) return;
  const { event } = await transitionLead(tx, { leadId: lead.id, to: "REPLIED", actor, meta: {} });
  await publishStatusChanged(tx, actor, event, { leadId: lead.id, serviceLine: lead.serviceLine, market: lead.market }, "reply");
}

async function storeClassification(
  tx: Tx,
  replyId: string,
  result: ClassifyResult,
  now: Date,
  overrides: { followUpDate?: Date | null },
): Promise<void> {
  const fields: Prisma.ReplyUpdateInput = {
    classification: result.classification,
    classificationSource: result.source,
    confidence: result.confidence,
    objectionSummary: result.objectionSummary,
    questions: result.questions,
    sentiment: result.sentiment,
    language: result.language,
    summary: result.summary,
    needsHumanReview: result.needsHumanReview,
    processedAt: now,
    ...(result.referral === null ? {} : { referral: result.referral }),
    ...(result.aiCallId === null ? {} : { aiCallId: result.aiCallId }),
    ...(overrides.followUpDate !== undefined ? { followUpDate: overrides.followUpDate } : {}),
  };
  await updateReplyClassification(tx, replyId, fields);
}

async function publishReplyEvents(tx: Tx, reply: ProcessingReply, lead: LeadProcessingRow, result: ClassifyResult, actor: Actor): Promise<void> {
  await publishAfterCommit(tx, {
    name: "reply.received",
    actor,
    payload: { replyId: reply.id, leadId: lead.id, channel: reply.channel, matched: true },
  });
  await publishAfterCommit(tx, {
    name: "reply.classified",
    actor,
    payload: { replyId: reply.id, leadId: lead.id, classification: result.classification, confidence: result.confidence, source: result.source },
  });
}

async function handleReferral(reply: ProcessingReply, lead: LeadProcessingRow, result: ClassifyResult, actor: Actor, now: Date): Promise<void> {
  const referral = result.referral;
  if (referral === null) return;
  if (referral.email === null) return;
  const normalisedEmail = normalizeEmail(referral.email);
  if (normalisedEmail === null) return;

  try {
    const verification = await getEmailVerifier().verify(normalisedEmail);
    const contactId = await withTransaction(async (tx) => {
      const upserted = await upsertContact(
        tx,
        lead.companyId,
        {
          ...(referral.name === null ? {} : { name: referral.name }),
          ...(referral.role === null ? {} : { role: referral.role }),
          email: normalisedEmail,
          emailStatus: verification.status,
        },
        { id: "referral", verified: true },
      );
      return upserted.record.id;
    });

    const contactability = await getContactability(null, { companyId: lead.companyId, contactId });
    if (contactability.email.status === "ALLOWED" || contactability.whatsapp.status === "ASSISTED_ALLOWED") {
      await proposeEnrollment(actor, { leadId: lead.id, contactId, reason: "REFERRAL" });
    }

    await withTransaction(async (tx) => {
      await updateReplyClassification(tx, reply.id, {
        referral: { ...referral, contactId, verification: verification.status },
      });
      await appendReplyActions(tx, reply.id, [{ action: "REFERRAL_PROPOSED", at: now.toISOString(), refId: contactId }]);
    });
  } catch (error) {
    inboxLog.warn("referral handling skipped", { leadId: lead.id, error: error instanceof Error ? error.message : "error" });
  }
}

async function bestEffortDraft(reply: ProcessingReply, lead: LeadProcessingRow, result: ClassifyResult, actor: Actor): Promise<void> {
  try {
    await generateReplyDraft(
      {
        replyId: reply.id,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: reply.contactId,
        serviceLine: lead.serviceLine,
        market: lead.market,
        classification: result.classification,
        ownerId: lead.ownerId,
        leadBrief: lead.brief,
        objectionSummary: result.objectionSummary,
        questions: result.questions,
        replyText: reply.latestText,
        replySubject: reply.subject,
        matchedMessageId: reply.messageId,
      },
      actor,
    );
    if (result.classification !== "WRONG_PERSON") {
      await withTransaction((tx) => appendReplyActions(tx, reply.id, [{ action: "DRAFT_CREATED", at: new Date().toISOString() }]));
    }
  } catch (error) {
    inboxLog.warn("reply draft skipped", { leadId: lead.id, error: error instanceof Error ? error.message : "error" });
  }
}

function outOfOfficeUntil(returnDateText: string | null, now: Date, fallbackDays: number): Date {
  if (returnDateText !== null && returnDateText !== "") {
    const direct = new Date(returnDateText);
    const withYear = new Date(`${returnDateText} ${String(now.getUTCFullYear())}`);
    const parsed = !Number.isNaN(direct.getTime()) ? direct : !Number.isNaN(withYear.getTime()) ? withYear : null;
    if (parsed !== null && parsed.getTime() > now.getTime()) return addDays(parsed, 1);
  }
  return addDays(now, fallbackDays);
}
