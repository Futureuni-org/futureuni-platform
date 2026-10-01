import "server-only";

/**
 * Enrolment and sequence materialisation (module spec §3.11). A sequence is snapshotted from the
 * active profile version the first time it is used, so running enrolments stay stable when a
 * profile changes (data-model: Sequence). The database enforces one ACTIVE/PAUSED thread per
 * company (INV-9, ADR-032); a second enrolment at the same company resolves to the leading thread.
 */

import type { Market, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { createOrOnConflict, type Enrollment, type Sequence, type SequenceStep, type Tx } from "@/platform/db";
import { getActiveProfile, listProfileVersions } from "@/modules/acquisition/profiles";

import {
  createEnrollment,
  createSequenceSnapshot,
  findActiveEnrollmentForLead,
  findSequenceSnapshot,
} from "./sequences.repo";

const ONE_OPEN_THREAD_CONSTRAINT = "acq_enrollments_one_open_thread";

/** Finds the active profile version id for a line (INV-16: exactly one active version). */
async function activeProfileVersionId(line: ServiceLine): Promise<string> {
  const versions = await listProfileVersions(line);
  const active = versions.find((v) => v.isActive);
  if (active === undefined) throw new AppError("NOT_FOUND", `No active profile version for ${line}`);
  return active.id;
}

/**
 * Returns the materialised default sequence for a line + market, creating the snapshot (Sequence +
 * SequenceStep rows) from the active profile the first time it is needed.
 */
export async function materializeDefaultSequence(
  tx: Tx,
  line: ServiceLine,
  market: Market,
): Promise<Sequence & { steps: SequenceStep[] }> {
  const profile = await getActiveProfile(line);
  const marketSequences = profile.sequences[market];
  const def = marketSequences.find((s) => s.isDefault) ?? marketSequences[0];
  if (def === undefined) throw new AppError("NOT_FOUND", `No sequence for ${line} / ${market}`);

  const profileVersionId = await activeProfileVersionId(line);
  const existing = await findSequenceSnapshot(tx, profileVersionId, market, def.id);
  if (existing !== null) return existing;

  return createSequenceSnapshot(
    tx,
    { serviceLine: line, market, profileVersionId, sequenceKey: def.id, name: def.name },
    def.steps.map((step) => ({
      stepIndex: step.index,
      channel: step.channel,
      delayBusinessDays: step.delayBusinessDays,
      purpose: step.purpose,
      ...(step.pitchAngleId === undefined ? {} : { pitchAngleId: step.pitchAngleId }),
      stopConditions: step.stopConditions,
    })),
  );
}

export interface EnrollResult {
  enrollment: Enrollment;
  created: boolean;
  sequence: Sequence & { steps: SequenceStep[] };
}

/**
 * Enrols a contact in its lead's default sequence. Idempotent at the company level: when an
 * ACTIVE/PAUSED thread already exists at the company (INV-9) the existing enrolment is returned
 * with `created: false` and no new thread is opened.
 */
export async function enroll(tx: Tx, leadId: string, contactId: string): Promise<EnrollResult> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { id: true, serviceLine: true, market: true, companyId: true },
  });
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found for enrolment.");

  const sequence = await materializeDefaultSequence(tx, lead.serviceLine, lead.market);

  const result = await createOrOnConflict<EnrollResult>(
    tx,
    ONE_OPEN_THREAD_CONSTRAINT,
    async () => {
      const enrollment = await createEnrollment(tx, {
        leadId: lead.id,
        contactId,
        companyId: lead.companyId,
        sequenceId: sequence.id,
        status: "ACTIVE",
        currentStepIndex: 0,
      });
      return { enrollment, created: true, sequence };
    },
    async () => {
      const existing = await findActiveEnrollmentForLead(tx, leadId);
      const atCompany =
        existing ??
        (await tx.enrollment.findFirst({
          where: { companyId: lead.companyId, status: { in: ["ACTIVE", "PAUSED"] } },
          orderBy: { createdAt: "desc" },
        }));
      if (atCompany === null) throw new AppError("CONFLICT", "An outreach thread already exists for this company.");
      return { enrollment: atCompany, created: false, sequence };
    },
  );
  return result;
}
