import "server-only";

import { unstable_rethrow } from "next/navigation";

import { err, type ActionResult } from "@/lib/result";
import { isAppError } from "@/lib/errors";
import { redactLogData } from "@/platform/audit-log/redact";

/**
 * The `catch` block of a server action: rethrow what the framework owns, log the rest, return a
 * typed failure.
 *
 * Next.js signals a redirect or a not-found by throwing, and `requireUser()` redirects to the
 * sign-in page when the session has expired. Those must reach the framework rather than become an
 * error result, or an expired session reads as "Something went wrong" instead of sending the person
 * to sign in. `unstable_rethrow` passes them on, and the Next.js docs say to call it first in the
 * catch block.
 *
 * Everything else is logged as one structured line before it is converted, because `err()` alone
 * turns any unexpected throw into a bare `INTERNAL` and the real cause never reaches the logs.
 * Message and context go through `redactLogData` (SEC-5), so no personal data is written.
 */
export function failedAction<T = never>(
  error: unknown,
  context: { action: string } & Record<string, unknown>,
): ActionResult<T> {
  unstable_rethrow(error);

  const cause = isAppError(error)
    ? { code: error.code, status: error.status }
    : { code: "INTERNAL", name: error instanceof Error ? error.name : typeof error };
  const message = error instanceof Error ? error.message : String(error);

  console.error(
    JSON.stringify({
      level: "error",
      msg: redactLogData(message),
      ...cause,
      ...redactLogData(context),
    }),
  );

  return err(error);
}
