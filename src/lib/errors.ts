/**
 * The single application error (CLAUDE.md §Conventions, docs/contracts/common.md §Errors).
 *
 * Every expected failure is an `AppError` with a code from `APP_ERROR_STATUS`; its HTTP status
 * comes from the code. Route handlers respond with `{ error: { code, message, details? } }`;
 * server actions return `ActionResult<T>` (src/lib/result.ts). Responses never carry stack
 * traces or internals: anything that isn't an `AppError` becomes `INTERNAL`.
 *
 * The code-to-status map is the one in docs/contracts/common.md. Phase 2's
 * `src/contracts/common.ts` re-exports it from here rather than redefining it.
 */

export const APP_ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_TRANSITION: 409,
  CONTACT_BLOCKED: 409,
  SUPPRESSED: 409,
  OUTSIDE_SEND_WINDOW: 409,
  MAILBOX_CAP_REACHED: 409,
  OUTREACH_PAUSED: 409,
  CITATION_INVALID: 422,
  BUDGET_EXCEEDED: 429,
  PROVIDER_ERROR: 502,
  PROVIDER_QUOTA_EXCEEDED: 429,
  AI_OUTPUT_INVALID: 502,
  AI_QUOTA_EXCEEDED: 429,
  AI_TIMEOUT: 504,
  AI_PROVIDER_ERROR: 502,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
} as const;

export type AppErrorCode = keyof typeof APP_ERROR_STATUS;

export type AppErrorDetails = Record<string, unknown>;

/** The serialisable shape (docs/contracts/common.md `AppErrorShape`). */
export interface AppErrorShape {
  code: AppErrorCode;
  message: string;
  status: number;
  details?: AppErrorDetails;
}

/** The body of an error response from a route handler. */
export interface ErrorResponseBody {
  error: { code: AppErrorCode; message: string; details?: AppErrorDetails };
}

/** Safe default messages: plain, specific, and free of internals. */
const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that.",
  VALIDATION_FAILED: "Some details need correcting.",
  CONFLICT: "That conflicts with a recent change. Refresh and try again.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  INVALID_TRANSITION: "That status change isn't allowed from the current status.",
  CONTACT_BLOCKED: "This contact can't be messaged on this channel.",
  SUPPRESSED: "This contact is on the do-not-contact list.",
  OUTSIDE_SEND_WINDOW: "It's outside the recipient's send window, so the send was rescheduled.",
  MAILBOX_CAP_REACHED: "The mailbox has reached today's sending limit.",
  OUTREACH_PAUSED: "Outreach is paused.",
  CITATION_INVALID: "Every claim must cite a stored finding or signal.",
  BUDGET_EXCEEDED: "The spending limit for this has been reached.",
  PROVIDER_ERROR: "An external service failed. Try again shortly.",
  PROVIDER_QUOTA_EXCEEDED: "An external service's usage limit has been reached.",
  AI_OUTPUT_INVALID: "The AI response couldn't be used. Try again.",
  AI_QUOTA_EXCEEDED: "The AI usage limit has been reached.",
  AI_TIMEOUT: "The AI took too long to respond. Try again.",
  AI_PROVIDER_ERROR: "The AI service failed. Try again shortly.",
  PAYLOAD_TOO_LARGE: "That's too large to upload.",
  UNSUPPORTED_MEDIA_TYPE: "That file type isn't supported.",
  INTERNAL: "Something went wrong on our side.",
};

export class AppError extends Error {
  override readonly name = "AppError";
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details: AppErrorDetails | undefined;

  constructor(
    code: AppErrorCode,
    message?: string,
    options?: { details?: AppErrorDetails; cause?: unknown },
  ) {
    super(
      message ?? DEFAULT_MESSAGES[code],
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.code = code;
    this.status = APP_ERROR_STATUS[code];
    this.details = options?.details;
  }

  toShape(): AppErrorShape {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Any thrown value as an `AppError`. Unknown errors become `INTERNAL`, keeping the original as `cause`. */
export function toAppError(error: unknown): AppError {
  return isAppError(error) ? error : new AppError("INTERNAL", undefined, { cause: error });
}

/** A route-handler error response: the HTTP status from the code, and no internals. */
export function errorResponse(error: unknown): Response {
  const appError = toAppError(error);
  const body: ErrorResponseBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  };
  return Response.json(body, { status: appError.status });
}
