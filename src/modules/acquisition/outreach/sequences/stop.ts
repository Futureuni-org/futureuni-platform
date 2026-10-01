import "server-only";

/**
 * Provided seams SEAM-STOP-SEQUENCE and SEAM-PAUSE-SEQUENCE (wave-3 guide Part B2). A stop by
 * companyId stops every contact at the company (INV-3); a pause holds the enrolment and resumes at
 * the same step when the pause date is reached. The contract types the `tx` parameter as `unknown`
 * (outreach-channel.ts); internally we narrow it with `dbOr`. See phases/12/REQUESTS.md.
 */

import {
  StopScopeSchema,
  type PauseEnrollment,
  type StopEnrollments,
} from "@/contracts/outreach-channel";
import { withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";

import { findActiveEnrollmentForLead, findEnrollmentsForScope } from "./sequences.repo";

async function runInTx<T>(tx: unknown, fn: (t: Tx) => Promise<T>): Promise<T> {
  const existing = tx as Tx | null | undefined;
  if (existing != null) return fn(existing);
  return withTransaction(fn);
}

export const stopEnrollments: StopEnrollments = async (tx, scope, reason) => {
  const parsed = StopScopeSchema.parse(scope);
  const clean: { leadId?: string; contactId?: string; companyId?: string } = {};
  if (parsed.leadId !== undefined) clean.leadId = parsed.leadId;
  if (parsed.contactId !== undefined) clean.contactId = parsed.contactId;
  if (parsed.companyId !== undefined) clean.companyId = parsed.companyId;

  return runInTx(tx, async (t) => {
    const enrollments = await findEnrollmentsForScope(t, clean);
    if (enrollments.length === 0) return { stopped: 0 };
    const ids = enrollments.map((e) => e.id);
    const now = new Date();
    await t.enrollment.updateMany({
      where: { id: { in: ids } },
      data: { status: "STOPPED", stoppedReason: reason, stoppedAt: now, nextRunAt: null },
    });
    await publishAfterCommit(t, {
      name: "outreach.enrollment.stopped",
      actor: { type: "SYSTEM", job: "acquisition.outreach.stop" },
      payload: { enrollmentIds: ids, scope: clean, reason: reason },
    });
    return { stopped: ids.length };
  });
};

export const pauseEnrollment: PauseEnrollment = async (tx, leadId, until, reason) => {
  await runInTx(tx, async (t) => {
    const enrollment = await findActiveEnrollmentForLead(t, leadId);
    if (enrollment?.status !== "ACTIVE") return;
    await t.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "PAUSED",
        pausedUntil: until,
        pauseReason: reason,
        nextRunAt: until,
      },
    });
  });
};

/**
 * Reactivates paused enrolments whose pause date has passed, resuming them at the same step (the
 * tick then processes them). Returns how many were resumed.
 */
export async function resumeDuePausedEnrollments(tx: Tx, now: Date): Promise<number> {
  const due = await tx.enrollment.findMany({
    where: { status: "PAUSED", pausedUntil: { not: null, lte: now } },
    select: { id: true, currentStepIndex: true },
  });
  if (due.length === 0) return 0;
  await tx.enrollment.updateMany({
    where: { id: { in: due.map((e) => e.id) } },
    data: { status: "ACTIVE", pausedUntil: null, pauseReason: null, nextRunAt: now },
  });
  return due.length;
}
