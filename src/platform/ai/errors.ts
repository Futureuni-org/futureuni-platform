import "server-only";

/**
 * AI-specific AppError helpers. Wraps @/lib/errors so callers don't need to remember the
 * exact code strings for the (many) AI failure modes. Every helper returns a new AppError.
 *
 * Uses conditional spreads to respect exactOptionalPropertyTypes: undefined is never passed
 * to optional fields.
 */

import { AppError, type AppErrorCode, type AppErrorDetails } from "@/lib/errors";

function make(
  code: AppErrorCode,
  details?: AppErrorDetails,
  cause?: unknown,
): AppError {
  const opts: { details?: AppErrorDetails; cause?: unknown } = {};
  if (details !== undefined) opts.details = details;
  if (cause !== undefined) opts.cause = cause;
  return new AppError(code, undefined, opts);
}

export function aiOutputInvalid(details?: AppErrorDetails, cause?: unknown): AppError {
  return make("AI_OUTPUT_INVALID", details, cause);
}

export function aiQuotaExceeded(details?: AppErrorDetails): AppError {
  return make("AI_QUOTA_EXCEEDED", details);
}

export function aiTimeout(details?: AppErrorDetails, cause?: unknown): AppError {
  return make("AI_TIMEOUT", details, cause);
}

export function aiProviderError(details?: AppErrorDetails, cause?: unknown): AppError {
  return make("AI_PROVIDER_ERROR", details, cause);
}

export function citationInvalid(details: AppErrorDetails): AppError {
  return make("CITATION_INVALID", details);
}
