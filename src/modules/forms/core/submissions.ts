/**
 * The submission service (docs/specs/module-forms.md §3, §7).
 *
 * `submitForm` is reached by an anonymous prospect, so it is the module's one untrusted entry
 * point and does all of its own defending: published form only, payload cap, answers normalised
 * against the definition, required questions enforced, and a per-caller rate limit.
 */

import "server-only";

import {
  FORM_LIMITS,
  fieldWithRole,
  type FormAnswers,
  type FormDefinition,
  type FormSubmissionRecord,
} from "@/contracts/forms";
import { AppError } from "@/lib/errors";
import { consume } from "@/platform/auth/rate-limit";
import { notify } from "@/platform/notifications";

import { getPublishedForm } from "../definitions";
import { answerToText, answersByteLength, missingRequired, normalizeAnswers } from "./answers";
import { FORM_NOTIFICATION_TYPES } from "./notifications";
import { createSubmission, deleteSubmission, getSubmission, listSubmissions } from "./submissions.repo";

/** Six briefs per hour from one caller: generous for a real prospect, useless for a script. */
const SUBMIT_LIMIT = { bucket: "forms.submit", windowMs: 60 * 60 * 1000, max: 6 } as const;

export interface SubmitFormInput {
  slug: string;
  version: number;
  answers: unknown;
  /** Something stable per caller (an IP), for the rate limit. */
  rateLimitSubject: string;
  now?: () => Date;
}

export interface SubmitFormResult {
  submissionId: string;
  /** The answers as stored, so the page can render the prospect's own copy of the brief. */
  answers: FormAnswers;
}

export async function submitForm(input: SubmitFormInput): Promise<SubmitFormResult> {
  const definition = getPublishedForm(input.slug);
  if (definition === undefined) {
    throw new AppError("NOT_FOUND", "This form is not accepting answers.");
  }

  // Validation first: it costs no database round trip, and a prospect whose browser and this
  // server disagree about a required question should not burn a rate-limit credit for it.
  const answers = normalizeAnswers(definition, input.answers);
  if (answersByteLength(answers) > FORM_LIMITS.payloadBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "That is more than this form can accept.");
  }

  const missing = missingRequired(definition, answers);
  if (missing.length > 0) {
    throw new AppError("VALIDATION_FAILED", "Some required questions have no answer yet.", {
      details: { fields: missing.map((field) => field.key) },
    });
  }

  // Then the limit, immediately before the write it protects.
  await consume(SUBMIT_LIMIT, input.rateLimitSubject);

  const now = (input.now ?? (() => new Date()))();
  const record = await createSubmission({
    formSlug: definition.slug,
    formVersion: definition.version,
    formTitle: definition.title,
    answers,
    contactName: roleAnswer(definition, answers, "contactName"),
    contactEmail: roleAnswer(definition, answers, "contactEmail"),
    submittedAt: now,
  });

  // The team should learn about a brief without watching a screen. A failure here must never lose
  // the brief that is already stored, so it is logged and swallowed.
  await announce(definition, record).catch((error: unknown) => {
    console.error("[forms] notifying the team about a new brief failed", {
      submissionId: record.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  return { submissionId: record.id, answers };
}

function roleAnswer(
  definition: FormDefinition,
  answers: FormAnswers,
  role: "contactName" | "contactEmail",
): string | null {
  const field = fieldWithRole(definition, role);
  if (field === undefined) return null;
  const text = answerToText(answers[field.key]).slice(0, 200);
  return text === "" ? null : text;
}

async function announce(definition: FormDefinition, record: FormSubmissionRecord): Promise<void> {
  const who = record.contactName ?? "Someone";
  const payload = {
    type: FORM_NOTIFICATION_TYPES.submissionReceived,
    title: `${who} filled in ${definition.title}`,
    body: "Open the brief to read what they asked for.",
    link: `/forms/${definition.slug}/${record.id}`,
    data: { formSlug: definition.slug, submissionId: record.id },
    dedupeKey: `forms.submission:${record.id}`,
  } as const;
  await notify({ ...payload, role: "ADMIN" });
  await notify({ ...payload, role: "MANAGER" });
}

/** One form's briefs, newest first. The caller checks `forms.submission.read`. */
export async function listFormSubmissions(
  slug: string,
  options: { limit?: number } = {},
): Promise<readonly FormSubmissionRecord[]> {
  return listSubmissions(slug, options);
}

/** One brief, or null. The caller checks `forms.submission.read`. */
export async function getFormSubmission(
  slug: string,
  id: string,
): Promise<FormSubmissionRecord | null> {
  const record = await getSubmission(id);
  // A brief is only reachable under the form it belongs to, so a guessed id can't cross forms.
  return record !== null && record.formSlug === slug ? record : null;
}


/**
 * Delete one brief for good. The caller must hold `forms.submission.delete` (ADMIN only, per the
 * manifest); the HTTP action enforces that and this service just performs the delete. Deleting a
 * submission for a slug it does not belong to is a `NOT_FOUND`, so a guessed id cannot cross
 * forms.
 */
export async function removeFormSubmission(slug: string, id: string): Promise<void> {
  const existing = await getFormSubmission(slug, id);
  if (existing === null) throw new AppError("NOT_FOUND");
  await deleteSubmission(id);
}
