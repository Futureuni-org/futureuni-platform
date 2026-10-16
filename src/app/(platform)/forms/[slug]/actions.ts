"use server";

/**
 * Server actions for one form's responses page. One action for now: delete a submission.
 */

import { revalidatePath } from "next/cache";

import { AppError } from "@/lib/errors";
import { err, ok, type ActionResult } from "@/lib/result";
import { requirePermission } from "@/platform/auth";
import { removeFormSubmission } from "@/modules/forms/core/submissions";

export async function deleteSubmissionAction(input: {
  slug: string;
  submissionId: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    if (typeof input.slug !== "string" || typeof input.submissionId !== "string") {
      throw new AppError("VALIDATION_FAILED");
    }
    // `forms.submission.delete` is ADMIN-only in the manifest; the matrix lookup enforces it,
    // throwing FORBIDDEN before the delete runs.
    await requirePermission("forms.submission.delete");
    await removeFormSubmission(input.slug, input.submissionId);
    revalidatePath(`/forms/${input.slug}`);
    revalidatePath(`/forms/${input.slug}/${input.submissionId}`);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}
