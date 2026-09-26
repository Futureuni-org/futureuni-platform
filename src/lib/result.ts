import { type AppErrorCode, type AppErrorDetails, toAppError } from "@/lib/errors";

/**
 * What every server action returns (docs/contracts/common.md `ActionResult<T>`).
 * Actions never throw to the client: they catch, and return `err(...)`.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; details?: AppErrorDetails } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/** A failed result from any thrown value. Unknown errors become `INTERNAL` with a safe message. */
export function err<T = never>(error: unknown): ActionResult<T> {
  const appError = toAppError(error);
  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  };
}
