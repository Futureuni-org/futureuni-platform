"use server";

/**
 * The public submit action (docs/specs/module-forms.md §5).
 *
 * The one entry point an anonymous caller can reach in this module, so it is deliberately thin:
 * parse with Zod, hand the rate-limit subject to the service, and return an `ActionResult`. Every
 * rule about what a valid brief is lives in `submitForm`, where the server and the renderer share
 * it. Nothing here throws to the client.
 */

import { headers } from "next/headers";

import { FormSubmissionInputSchema } from "@/contracts/forms";
import { AppError } from "@/lib/errors";
import { err, ok, type ActionResult } from "@/lib/result";
import { submitForm } from "@/modules/forms/core/submissions";

/** The caller's address, for the rate limit. Unknown callers share one bucket. */
async function rateLimitSubject(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return headerList.get("x-real-ip") ?? "unknown";
}

export async function submitFormAction(
  input: unknown,
): Promise<ActionResult<{ submissionId: string }>> {
  try {
    const parsed = FormSubmissionInputSchema.safeParse(input);
    if (!parsed.success) {
      // A Zod failure here means the payload was not built by our own renderer.
      throw new AppError("VALIDATION_FAILED", "We could not read those answers.");
    }
    const result = await submitForm({
      slug: parsed.data.slug,
      version: parsed.data.version,
      answers: parsed.data.answers,
      rateLimitSubject: await rateLimitSubject(),
    });
    return ok({ submissionId: result.submissionId });
  } catch (error) {
    return err(error);
  }
}
