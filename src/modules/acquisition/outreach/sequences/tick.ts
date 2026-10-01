import "server-only";

/**
 * The sequence tick (step 3), driven every 5 minutes by the cron dispatcher. For each due
 * enrolment it re-checks the stop conditions (a reply, suppression, a bounce, a meeting, or the
 * lead no longer active), drafts the next step, and either queues it for review or auto-approves it
 * under the profile rules. It then dispatches any scheduled sends that are now due. Delays between
 * steps are counted in business days in the recipient's timezone.
 */

import type { Actor, EnrollmentStopReason } from "@/contracts/common";
import { db, withTransaction } from "@/platform/db";
import { isSuppressed } from "@/modules/acquisition/core";

import { createDraft } from "../draft/draft";
import { autoApproveIfEligible } from "../review/review";
import { sendEmailMessage } from "../email/send";
import { findDueEnrollments, listSequenceSteps, updateEnrollment } from "./sequences.repo";
import { resumeDuePausedEnrollments, stopEnrollments } from "./stop";

const TICK_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.outreach.tick" };
const BATCH = 50;

function stopReasonForStatus(status: string): EnrollmentStopReason | null {
  switch (status) {
    case "CONTACTED":
      return null; // still active in the sequence
    case "REPLIED":
      return "REPLY";
    case "MEETING_BOOKED":
      return "MEETING_BOOKED";
    case "WON":
      return "WON";
    case "LOST":
      return "LOST";
    case "SUPPRESSED":
      return "SUPPRESSED";
    default:
      return "MANUAL";
  }
}

export interface TickResult {
  advanced: number;
  drafted: number;
  stopped: number;
  sent: number;
  resumed: number;
}

export async function runOutreachTick(now: Date = new Date()): Promise<TickResult> {
  const resumed = await withTransaction((tx) => resumeDuePausedEnrollments(tx, now));

  const due = await findDueEnrollments(null, now, BATCH);
  let drafted = 0;
  let stopped = 0;
  for (const enrollment of due) {
    const outcome = await advanceEnrollment(enrollment.id, now);
    if (outcome === "drafted") drafted += 1;
    else if (outcome === "stopped") stopped += 1;
  }

  const sent = await dispatchDueSends(now);
  return { advanced: due.length, drafted, stopped, sent, resumed };
}

type AdvanceOutcome = "drafted" | "stopped" | "completed" | "skipped";

async function advanceEnrollment(enrollmentId: string, now: Date): Promise<AdvanceOutcome> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true, leadId: true, contactId: true, companyId: true, sequenceId: true, currentStepIndex: true, status: true,
      lead: { select: { status: true } },
      contact: { select: { email: true, phone: true } },
      company: { select: { normalizedDomain: true } },
    },
  });
  if (enrollment?.status !== "ACTIVE") return "skipped";

  // Stop conditions.
  const stopReason = stopReasonForStatus(enrollment.lead.status);
  if (stopReason !== null) {
    await stopEnrollments(null, { companyId: enrollment.companyId }, stopReason);
    return "stopped";
  }
  const suppressed = await isSuppressed(null, {
    ...(enrollment.contact.email === null ? {} : { email: enrollment.contact.email }),
    ...(enrollment.contact.phone === null ? {} : { phone: enrollment.contact.phone }),
    ...(enrollment.company.normalizedDomain === null ? {} : { domain: enrollment.company.normalizedDomain }),
  });
  if (suppressed) {
    await stopEnrollments(null, { companyId: enrollment.companyId }, "SUPPRESSED");
    return "stopped";
  }
  const replies = await db.reply.count({ where: { leadId: enrollment.leadId } });
  if (replies > 0) {
    await stopEnrollments(null, { companyId: enrollment.companyId }, "REPLY");
    return "stopped";
  }

  const steps = await listSequenceSteps(null, enrollment.sequenceId);
  const nextStepIndex = enrollment.currentStepIndex + 1;
  const step = steps.find((s) => s.stepIndex === nextStepIndex);
  if (step === undefined) {
    await withTransaction((tx) => updateEnrollment(tx, enrollmentId, { status: "COMPLETED", completedAt: now, nextRunAt: null }));
    return "completed";
  }

  const result = await createDraft(TICK_ACTOR, {
    leadId: enrollment.leadId,
    contactId: enrollment.contactId,
    stepIndex: nextStepIndex,
    transition: false,
    system: true,
  });
  if (result.status === "skipped") {
    await withTransaction((tx) => updateEnrollment(tx, enrollmentId, { nextRunAt: null }));
    return "skipped";
  }

  await withTransaction(async (tx) => {
    await tx.message.update({ where: { id: result.messageId }, data: { enrollmentId } });
    await updateEnrollment(tx, enrollmentId, { currentStepIndex: nextStepIndex, nextRunAt: null });
  });

  // Email steps may auto-approve under the profile rules; assisted steps always wait for a human.
  if (step.channel === "EMAIL") await autoApproveIfEligible(result.messageId, now);
  return "drafted";
}

/** Sends scheduled email messages that are now due (first touches and auto-approved follow-ups). */
export async function dispatchDueSends(now: Date): Promise<number> {
  const dueMessages = await db.message.findMany({
    where: { status: "SCHEDULED", channel: "EMAIL", scheduledFor: { not: null, lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: BATCH,
    select: { id: true },
  });
  let sent = 0;
  for (const message of dueMessages) {
    const outcome = await sendEmailMessage(message.id, { now });
    if (outcome.status === "sent") sent += 1;
  }
  return sent;
}
