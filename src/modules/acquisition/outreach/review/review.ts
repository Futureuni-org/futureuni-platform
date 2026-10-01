import "server-only";

/**
 * The approval queue and review services (step 2). Humans approve, edit (with a claims
 * confirmation), reject, regenerate and snooze; the auto-send path approves eligible drafts under
 * the profile's rules. Approving enrols a first touch and schedules its send. Every approve checks,
 * in order: permission (+canApprove for members), email contactability (INV-6), suppression
 * (INV-2), that no cited finding has been dismissed (INV-18) and the first-touch throttle.
 */

import type { Actor, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { streamTask } from "@/platform/ai";
import type { StreamTaskEvent } from "@/contracts/ai-service";
import { assertEmailAllowed } from "@/modules/acquisition/compliance";
import { isSuppressed, transitionLead } from "@/modules/acquisition/core";
import { getActiveProfile } from "@/modules/acquisition/profiles";

import { getLeadBrief, getOutreachThrottle } from "../_seams";
import { getOutreachSetting } from "../settings";
import { buildSendWindow, nextSendSlot, resolveRecipientTimezone } from "../email/send-window";
import { dismissedCitedFindingIds, loadMessageForSend, updateMessage, type MessageForSend } from "../email/email.repo";
import { enroll } from "../sequences/enroll";
import { createDraft, ensureOutreachTasksRegistered } from "../draft/draft";
import { validateDraftShape } from "../draft/validators";
import { queryReviewQueue, type ReviewQueueFilter } from "./review.repo";

const SEND_ACTOR_JOB = "acquisition.outreach.tick";

function isFirstTouch(message: MessageForSend): boolean {
  return message.stepIndex === 0 && message.lead.status === "IN_REVIEW";
}

/** The automatic checks every approval (human or auto) must pass. Throws on the first failure. */
async function assertApprovable(message: MessageForSend): Promise<void> {
  if (message.contact === null) throw new AppError("VALIDATION_FAILED", "The message has no contact.");
  const firstTouch = message.stepIndex === null || message.stepIndex === 0;

  if (message.channel === "EMAIL") {
    await assertEmailAllowed(null, { companyId: message.companyId, contactId: message.contact.id });
    const suppressed = await isSuppressed(null, {
      ...(message.contact.email === null ? {} : { email: message.contact.email }),
      ...(message.contact.phone === null ? {} : { phone: message.contact.phone }),
      ...(message.company.normalizedDomain === null ? {} : { domain: message.company.normalizedDomain }),
    });
    if (suppressed) throw new AppError("SUPPRESSED", "This contact is suppressed.");
  }

  const dismissed = await dismissedCitedFindingIds(null, message.id);
  if (dismissed.length > 0) throw new AppError("CITATION_INVALID", "A cited finding was dismissed since drafting.");

  if (firstTouch) {
    const throttle = await getOutreachThrottle(message.lead.serviceLine);
    if (throttle.mode === "PAUSED") throw new AppError("OUTREACH_PAUSED", `Outreach is paused for ${message.lead.serviceLine}.`);
  }
}

interface FinalizeOptions {
  actor: Actor;
  auto: boolean;
  humanConfirmedClaims?: boolean;
  now: Date;
}

/** Writes the approval: status, enrolment (first touch), schedule (email), transition, events. */
async function finalizeApproval(tx: Tx, message: MessageForSend, opts: FinalizeOptions): Promise<{ scheduledFor: Date | null }> {
  const firstTouch = isFirstTouch(message);
  const userId = opts.actor.type === "USER" ? opts.actor.userId : null;

  let enrollmentId = message.enrollmentId;
  if (firstTouch && message.contact !== null) {
    const result = await enroll(tx, message.leadId, message.contact.id);
    enrollmentId = result.enrollment.id;
    await publishAfterCommit(tx, {
      name: "outreach.enrolled",
      actor: opts.actor,
      payload: { enrollmentId: result.enrollment.id, leadId: message.leadId, contactId: message.contact.id, sequenceId: result.sequence.id },
    });
  }

  let scheduledFor: Date | null = null;
  if (message.channel === "EMAIL") {
    const timezone = resolveRecipientTimezone({ country: message.company.country, city: message.company.city, region: message.company.region });
    const window = buildSendWindow({
      timezone,
      start: await getOutreachSetting("sendWindowStart"),
      end: await getOutreachSetting("sendWindowEnd"),
      jitterMinutes: await getOutreachSetting("sendWindowJitterMinutes"),
    });
    scheduledFor = nextSendSlot(window, opts.now);
  }

  await updateMessage(tx, message.id, {
    status: message.channel === "EMAIL" ? "SCHEDULED" : "APPROVED",
    approvedAt: opts.now,
    ...(userId === null ? {} : { approvedById: userId }),
    autoApproved: opts.auto,
    ...(enrollmentId === null ? {} : { enrollmentId }),
    ...(scheduledFor === null ? {} : { scheduledFor }),
    ...(opts.humanConfirmedClaims === true
      ? { humanConfirmedClaims: true, humanConfirmedAt: opts.now, ...(userId === null ? {} : { humanConfirmedById: userId }) }
      : {}),
  });

  if (firstTouch) {
    const { event } = await transitionLead(tx, { leadId: message.leadId, to: "APPROVED", actor: opts.actor, reason: opts.auto ? "auto-approved" : "approved" });
    if (event !== null) {
      await publishAfterCommit(tx, {
        name: "lead.statusChanged",
        actor: opts.actor,
        payload: { leadId: message.leadId, leadEventId: event.id, from: event.fromStatus, to: "APPROVED", serviceLine: message.lead.serviceLine, market: message.lead.market, reason: opts.auto ? "auto-approved" : "approved" },
      });
    }
  }

  if (opts.auto) {
    await audit.record(tx, { actor: opts.actor, action: "acquisition.message.approve", targetType: "Message", targetId: message.id, after: { auto: true } });
  }

  await publishAfterCommit(tx, { name: "message.approved", actor: opts.actor, payload: { messageId: message.id, leadId: message.leadId, auto: opts.auto } });
  return { scheduledFor };
}

export interface ApproveOptions {
  humanConfirmedClaims?: boolean;
  now?: Date;
}

export async function approveMessage(actor: Actor, messageId: string, options: ApproveOptions = {}): Promise<{ messageId: string; scheduledFor: Date | null }> {
  const message = await loadMessageForSend(null, messageId);
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  await assertActorCan(actor, "acquisition.message.approve", { serviceLine: message.lead.serviceLine, ownerId: message.lead.ownerId ?? undefined });

  if (!["DRAFT", "NEEDS_EDIT"].includes(message.status)) throw new AppError("CONFLICT", `Message is ${message.status}.`);
  if ((message.humanEdited || message.status === "NEEDS_EDIT") && options.humanConfirmedClaims !== true) {
    throw new AppError("VALIDATION_FAILED", "Edited text needs a claims confirmation before approval.");
  }

  await assertApprovable(message);
  const now = options.now ?? new Date();
  const result = await withTransaction((tx) =>
    finalizeApproval(tx, message, { actor, auto: false, now, ...(options.humanConfirmedClaims === undefined ? {} : { humanConfirmedClaims: options.humanConfirmedClaims }) }),
  );
  return { messageId, scheduledFor: result.scheduledFor };
}

/**
 * Auto-send: approves an eligible draft under the profile's `AUTO_SEND_ABOVE_SCORE` rule by the
 * system actor. Assisted channels always need a human, so only EMAIL drafts auto-approve. Returns
 * whether it approved and, when it did not, why.
 */
export async function autoApproveIfEligible(messageId: string, now: Date = new Date()): Promise<{ approved: boolean; reason?: string }> {
  const message = await loadMessageForSend(null, messageId);
  if (message === null) return { approved: false, reason: "not-found" };
  if (message.channel !== "EMAIL") return { approved: false, reason: "assisted-needs-human" };
  if (message.status !== "DRAFT") return { approved: false, reason: `status-${message.status}` };
  if (message.lead.complianceReview) return { approved: false, reason: "compliance-review" };

  const profile = await getActiveProfile(message.lead.serviceLine);
  if (profile.approvalMode !== "AUTO_SEND_ABOVE_SCORE" || profile.autoSendMinScore === undefined) {
    return { approved: false, reason: "mode-always-review" };
  }
  const brief = await getLeadBrief(message.leadId);
  if (brief.score === null || brief.score < profile.autoSendMinScore) return { approved: false, reason: "below-threshold" };

  // `needsHumanReview` is read from the lead row.
  const { db } = await import("@/platform/db");
  const flags = await db.lead.findUnique({ where: { id: message.leadId }, select: { needsHumanReview: true } });
  if (flags?.needsHumanReview === true) return { approved: false, reason: "needs-human-review" };

  try {
    await assertApprovable(message);
  } catch (error) {
    return { approved: false, reason: error instanceof AppError ? error.code : "checks-failed" };
  }

  await withTransaction((tx) => finalizeApproval(tx, message, { actor: { type: "SYSTEM", job: SEND_ACTOR_JOB }, auto: true, now }));
  return { approved: true };
}

export interface EditMessageInput {
  subject: string | null;
  body: string;
}

/** Edits a draft's wording. Human-edited text can only be approved with a claims confirmation. */
export async function editMessage(actor: Actor, messageId: string, input: EditMessageInput): Promise<void> {
  const message = await loadMessageForSend(null, messageId);
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  await assertActorCan(actor, "acquisition.message.draft", { serviceLine: message.lead.serviceLine, ownerId: message.lead.ownerId ?? undefined });
  if (!["DRAFT", "NEEDS_EDIT"].includes(message.status)) throw new AppError("CONFLICT", `Message is ${message.status}.`);

  const shape = validateDraftShape({
    channel: message.channel,
    isFirstTouch: message.stepIndex === 0,
    subject: input.subject,
    body: input.body,
    allowedLinks: extractLinks(input.body), // human edits own their links
  });
  if (!shape.ok) throw new AppError("VALIDATION_FAILED", shape.errors.join(" "), { details: { errors: shape.errors } });

  await updateMessage(null, messageId, {
    subject: input.subject,
    body: input.body,
    humanEdited: true,
    humanConfirmedClaims: false,
    humanConfirmedById: null,
    humanConfirmedAt: null,
    status: "DRAFT",
  });
}

function extractLinks(body: string): string[] {
  return (body.match(/\bhttps?:\/\/[^\s<>"')]+/gi) ?? []).map((u) => u.replace(/[.,;:]+$/, ""));
}

export interface RejectMessageInput {
  reason: "WRONG_FACTS" | "TONE" | "NOT_A_FIT" | "WRONG_CONTACT" | "COMPLIANCE" | "DUPLICATE" | "OTHER";
  note?: string;
  disqualifyLead?: boolean;
}

export async function rejectMessage(actor: Actor, messageId: string, input: RejectMessageInput): Promise<void> {
  const message = await loadMessageForSend(null, messageId);
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  await assertActorCan(actor, "acquisition.message.reject", { serviceLine: message.lead.serviceLine, ownerId: message.lead.ownerId ?? undefined });
  if (!["DRAFT", "NEEDS_EDIT"].includes(message.status)) throw new AppError("CONFLICT", `Message is ${message.status}.`);

  await withTransaction(async (tx) => {
    await updateMessage(tx, messageId, {
      status: "REJECTED",
      rejectReason: input.reason,
      ...(input.note === undefined ? {} : { rejectNote: input.note }),
    });

    if (message.lead.status === "IN_REVIEW") {
      const to = input.disqualifyLead === true ? "DISQUALIFIED" : "SCORED";
      const { event } = await transitionLead(tx, {
        leadId: message.leadId,
        to,
        actor,
        reason: `draft rejected: ${input.reason}`,
      });
      if (event !== null) {
        await publishAfterCommit(tx, {
          name: "lead.statusChanged",
          actor,
          payload: { leadId: message.leadId, leadEventId: event.id, from: event.fromStatus, to, serviceLine: message.lead.serviceLine, market: message.lead.market, reason: `draft rejected: ${input.reason}` },
        });
      }
    }
  });
}

export interface RegenerateInput {
  instruction?: string;
}

/** Cancels the current draft and generates a fresh one for the same step (style hint, never facts). */
export async function regenerateMessage(actor: Actor, messageId: string, input: RegenerateInput = {}): Promise<{ messageId: string }> {
  if (input.instruction?.trim() === "") {
    throw new AppError("VALIDATION_FAILED", "The regenerate instruction cannot be empty.");
  }
  const message = await loadMessageForSend(null, messageId);
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  await assertActorCan(actor, "acquisition.message.draft", { serviceLine: message.lead.serviceLine, ownerId: message.lead.ownerId ?? undefined });
  if (!["DRAFT", "NEEDS_EDIT"].includes(message.status)) throw new AppError("CONFLICT", `Message is ${message.status}.`);

  await updateMessage(null, messageId, { status: "CANCELLED" });
  const contactId = message.contact?.id;
  const result = await createDraft(actor, {
    leadId: message.leadId,
    ...(contactId === undefined ? {} : { contactId }),
    stepIndex: message.stepIndex ?? 0,
    transition: false,
  });
  if (result.status === "skipped") throw new AppError("CONFLICT", `Could not regenerate: ${result.reason}`);
  return { messageId: result.messageId };
}

export async function snoozeLead(actor: Actor, leadId: string, until: Date): Promise<void> {
  const { db } = await import("@/platform/db");
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { serviceLine: true, ownerId: true } });
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.lead.update", { serviceLine: lead.serviceLine, ownerId: lead.ownerId ?? undefined });
  await db.lead.update({ where: { id: leadId }, data: { snoozedUntil: until } });
}

/** Live editor assist (streamTask). The instruction is a style hint, never a source of facts. */
export async function streamDraftEdit(actor: Actor, messageId: string, instruction: string): Promise<ReadableStream<StreamTaskEvent>> {
  ensureOutreachTasksRegistered();
  const message = await loadMessageForSend(null, messageId);
  if (message === null) throw new AppError("NOT_FOUND", "Message not found.");
  await assertActorCan(actor, "acquisition.message.draft", { serviceLine: message.lead.serviceLine, ownerId: message.lead.ownerId ?? undefined });

  return streamTask({
    task: "acquisition.outreach-draft-edit",
    input: {
      channel: message.channel,
      isFirstTouch: message.stepIndex === 0,
      instruction,
      subject: message.subject,
      body: message.body,
    },
    actor,
    context: { leadId: message.leadId, module: "acquisition" },
  });
}

export interface ReviewQueueItem {
  messageId: string;
  status: string;
  channel: string;
  stepIndex: number | null;
  subject: string | null;
  body: string;
  citedFindingIds: string[];
  lead: {
    id: string;
    serviceLine: string;
    market: string;
    score: number | null;
    scoreBand: string | null;
    brief: string | null;
    needsHumanReview: boolean;
    complianceReview: boolean;
    heldByCrossSell: boolean;
  };
  company: { id: string; name: string; country: string | null; city: string | null };
  contact: { id: string; name: string | null; role: string | null } | null;
}

export interface GetReviewQueueInput {
  serviceLine?: ServiceLine;
  market?: string;
  ownerId?: string;
  needsHumanReview?: boolean;
  complianceReview?: boolean;
  cursor?: string;
  limit?: number;
}

export async function getReviewQueue(actor: Actor, input: GetReviewQueueInput): Promise<{ items: ReviewQueueItem[]; nextCursor: string | null }> {
  await assertActorCan(actor, "acquisition.review.read", input.serviceLine === undefined ? undefined : { serviceLine: input.serviceLine });
  const filter: ReviewQueueFilter = {
    limit: Math.min(Math.max(input.limit ?? 25, 1), 100),
    ...(input.serviceLine === undefined ? {} : { serviceLine: input.serviceLine }),
    ...(input.market === undefined ? {} : { market: input.market }),
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
    ...(input.needsHumanReview === undefined ? {} : { needsHumanReview: input.needsHumanReview }),
    ...(input.complianceReview === undefined ? {} : { complianceReview: input.complianceReview }),
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  };
  const { rows, nextCursor } = await queryReviewQueue(null, filter);
  const items: ReviewQueueItem[] = rows.map((row) => ({
    messageId: row.id,
    status: row.status,
    channel: row.channel,
    stepIndex: row.stepIndex,
    subject: row.subject,
    body: row.body,
    citedFindingIds: row.citations.flatMap((c) => (c.findingId === null ? [] : [c.findingId])),
    lead: {
      id: row.lead.id,
      serviceLine: row.lead.serviceLine,
      market: row.lead.market,
      score: row.lead.score,
      scoreBand: row.lead.scoreBand,
      brief: row.lead.brief,
      needsHumanReview: row.lead.needsHumanReview,
      complianceReview: row.lead.complianceReview,
      heldByCrossSell: row.lead.heldByCrossSell,
    },
    company: { id: row.company.id, name: row.company.name, country: row.company.country, city: row.company.city },
    contact: row.contact === null ? null : { id: row.contact.id, name: row.contact.name, role: row.contact.role },
  }));
  return { items, nextCursor };
}
