/**
 * Database access for submitted briefs (docs/specs/module-forms.md §4). The only file in this
 * module that talks to Prisma.
 *
 * `answers` is validated against the form definition before it reaches here — this file never
 * decides what a valid answer is, it only stores and reads.
 */

import "server-only";

import type { FormAnswers, FormSubmissionRecord } from "@/contracts/forms";
import { db, toJsonInput } from "@/platform/db";

export interface CreateSubmission {
  formSlug: string;
  formVersion: number;
  formTitle: string;
  answers: FormAnswers;
  contactName: string | null;
  contactEmail: string | null;
  submittedAt: Date;
}

const SELECT = {
  id: true,
  formSlug: true,
  formVersion: true,
  formTitle: true,
  status: true,
  answers: true,
  contactName: true,
  contactEmail: true,
  submittedAt: true,
} as const;

interface Row {
  id: string;
  formSlug: string;
  formVersion: number;
  formTitle: string;
  status: "COMPLETE";
  answers: unknown;
  contactName: string | null;
  contactEmail: string | null;
  submittedAt: Date;
}

/**
 * A stored row as the screens read it. The JSON column is typed `unknown` by Prisma; it was
 * validated on write, and `normalizeAnswers` is applied again by the caller before rendering, so
 * the cast here is the only place the shape is assumed.
 */
function toRecord(row: Row): FormSubmissionRecord {
  return {
    id: row.id,
    formSlug: row.formSlug,
    formVersion: row.formVersion,
    formTitle: row.formTitle,
    status: row.status,
    answers: (row.answers ?? {}) as FormAnswers,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    submittedAt: row.submittedAt,
  };
}

export async function createSubmission(input: CreateSubmission): Promise<FormSubmissionRecord> {
  const row = await db.formSubmission.create({
    data: {
      formSlug: input.formSlug,
      formVersion: input.formVersion,
      formTitle: input.formTitle,
      answers: toJsonInput(input.answers),
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      submittedAt: input.submittedAt,
    },
    select: SELECT,
  });
  return toRecord(row);
}

/** One form's submissions, newest first. */
export async function listSubmissions(
  formSlug: string,
  options: { limit?: number } = {},
): Promise<readonly FormSubmissionRecord[]> {
  const rows = await db.formSubmission.findMany({
    where: { formSlug },
    orderBy: { submittedAt: "desc" },
    take: Math.min(options.limit ?? 100, 200),
    select: SELECT,
  });
  return rows.map(toRecord);
}

export async function getSubmission(id: string): Promise<FormSubmissionRecord | null> {
  const row = await db.formSubmission.findUnique({ where: { id }, select: SELECT });
  return row === null ? null : toRecord(row);
}

/** Submission counts and the newest submission time, per form slug — for the forms list. */
export async function submissionStats(): Promise<
  ReadonlyMap<string, { count: number; newest: Date | null }>
> {
  const rows = await db.formSubmission.groupBy({
    by: ["formSlug"],
    _count: { _all: true },
    _max: { submittedAt: true },
  });
  return new Map(
    rows.map((row) => [
      row.formSlug,
      { count: row._count._all, newest: row._max.submittedAt ?? null },
    ]),
  );
}

export async function deleteSubmission(id: string): Promise<void> {
  await db.formSubmission.delete({ where: { id } });
}
