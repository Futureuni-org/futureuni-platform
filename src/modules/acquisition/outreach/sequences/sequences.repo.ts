import "server-only";

/**
 * Data access for sequences, their steps and enrolments (naming convention: `*.repo.ts`).
 */

import {
  dbOr,
  type Enrollment,
  type Prisma,
  type Sequence,
  type SequenceStep,
  type Tx,
} from "@/platform/db";

export type SequenceStepRow = Pick<
  SequenceStep,
  "stepIndex" | "channel" | "delayBusinessDays" | "purpose" | "pitchAngleId" | "stopConditions"
>;

export function findSequenceSnapshot(
  tx: Tx | null,
  profileVersionId: string,
  market: Sequence["market"],
  sequenceKey: string,
): Promise<(Sequence & { steps: SequenceStep[] }) | null> {
  return dbOr(tx).sequence.findUnique({
    where: { profileVersionId_market_sequenceKey: { profileVersionId, market, sequenceKey } },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
}

export function createSequenceSnapshot(
  tx: Tx,
  data: Prisma.SequenceUncheckedCreateInput,
  steps: Prisma.SequenceStepCreateManySequenceInput[],
): Promise<Sequence & { steps: SequenceStep[] }> {
  return tx.sequence.create({
    data: { ...data, steps: { createMany: { data: steps } } },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
}

export function listSequenceSteps(tx: Tx | null, sequenceId: string): Promise<SequenceStep[]> {
  return dbOr(tx).sequenceStep.findMany({
    where: { sequenceId },
    orderBy: { stepIndex: "asc" },
  });
}

export function findEnrollment(tx: Tx | null, id: string): Promise<Enrollment | null> {
  return dbOr(tx).enrollment.findUnique({ where: { id } });
}

export function findActiveEnrollmentForLead(tx: Tx | null, leadId: string): Promise<Enrollment | null> {
  return dbOr(tx).enrollment.findFirst({
    where: { leadId, status: { in: ["ACTIVE", "PAUSED"] } },
    orderBy: { createdAt: "desc" },
  });
}

export function createEnrollment(tx: Tx, data: Prisma.EnrollmentUncheckedCreateInput): Promise<Enrollment> {
  return tx.enrollment.create({ data });
}

export function updateEnrollment(
  tx: Tx,
  id: string,
  data: Prisma.EnrollmentUncheckedUpdateInput,
): Promise<Enrollment> {
  return tx.enrollment.update({ where: { id }, data });
}

/** Enrolments due to run: ACTIVE with nextRunAt at or before `now`. */
export function findDueEnrollments(tx: Tx | null, now: Date, limit: number): Promise<Enrollment[]> {
  return dbOr(tx).enrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { not: null, lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
}

/** Active/paused enrolments matching a stop scope (lead, contact or company). */
export function findEnrollmentsForScope(
  tx: Tx,
  scope: { leadId?: string; contactId?: string; companyId?: string },
  statuses: Enrollment["status"][] = ["ACTIVE", "PAUSED"],
): Promise<Enrollment[]> {
  const where: Prisma.EnrollmentWhereInput = { status: { in: statuses } };
  if (scope.companyId !== undefined) where.companyId = scope.companyId;
  if (scope.contactId !== undefined) where.contactId = scope.contactId;
  if (scope.leadId !== undefined) where.leadId = scope.leadId;
  return tx.enrollment.findMany({ where });
}

export type { Enrollment, Sequence, SequenceStep };
