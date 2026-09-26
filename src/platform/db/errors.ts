import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";

/**
 * Database errors as AppErrors (saas-data: a unique violation is an expected outcome, never a
 * pre-check). With the pg driver adapter, Prisma reports the PostgreSQL SQLSTATE and constraint
 * name under `meta.driverAdapterError.cause`.
 *
 * Postgres's `detail` can quote the failing row (personal data), so it's never copied. The
 * AppError carries no database internals either: its cause is a sanitised Error naming only the
 * SQLSTATE code and the constraint (for logs), and responses show just the code and message.
 */

interface DriverCause {
  originalCode?: unknown;
  originalMessage?: unknown;
  constraint?: unknown;
}

const SQLSTATE = {
  UNIQUE: "23505",
  FOREIGN_KEY: "23503",
  CHECK: "23514",
  NOT_NULL: "23502",
  SERIALIZATION: "40001",
  DEADLOCK: "40P01",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function driverCause(error: Prisma.PrismaClientKnownRequestError): DriverCause | null {
  const adapterError = error.meta?.driverAdapterError;
  if (!isRecord(adapterError) || !isRecord(adapterError.cause)) return null;
  return adapterError.cause;
}

/** The SQLSTATE behind a Prisma error, when the database raised it. */
export function sqlState(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const code = driverCause(error)?.originalCode;
  return typeof code === "string" ? code : null;
}

/** The name of the constraint or index a database error names, for example "acq_leads_one_open". */
export function violatedConstraint(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = driverCause(error);
  if (isRecord(cause?.constraint) && typeof cause.constraint.index === "string")
    return cause.constraint.index;
  const message = cause?.originalMessage;
  if (typeof message !== "string") return null;
  return /constraint "([^"]+)"/.exec(message)?.[1] ?? null;
}

/**
 * True for a unique violation, optionally of one named constraint. Use it where a unique index
 * is the rule, for example INV-9's "acq_enrollments_one_open_thread": catch it and refuse cleanly.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const unique =
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
    sqlState(error) === SQLSTATE.UNIQUE;
  return unique && (constraint === undefined || violatedConstraint(error) === constraint);
}

/**
 * Maps a known database error to an AppError, or returns null when it isn't one:
 * - unique violation → CONFLICT
 * - foreign-key violation → CONFLICT (a referenced row is missing or still referenced)
 * - CHECK or NOT NULL violation → VALIDATION_FAILED
 * - record not found (for example a conditional update that matched nothing) → NOT_FOUND
 * - write conflict, serialization failure or deadlock → CONFLICT (safe to retry)
 */
export function toDbAppError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const state = sqlState(error);
  const constraint = violatedConstraint(error);
  // The constraint name stays on the cause (for logs); responses carry no database internals.
  // Callers that map a constraint to a field use violatedConstraint(error) on the original error.
  const cause = new Error(
    `database error ${error.code}${state === null ? "" : ` (${state})`}${constraint === null ? "" : ` on ${constraint}`}`,
  );
  const make = (code: "CONFLICT" | "VALIDATION_FAILED" | "NOT_FOUND", message?: string) =>
    new AppError(code, message, { cause });

  if (error.code === "P2002" || state === SQLSTATE.UNIQUE) {
    return make("CONFLICT", "That already exists.");
  }
  if (error.code === "P2003" || state === SQLSTATE.FOREIGN_KEY) {
    return make("CONFLICT", "That's linked to a record that's missing or still in use.");
  }
  if (state === SQLSTATE.CHECK || state === SQLSTATE.NOT_NULL) return make("VALIDATION_FAILED");
  if (error.code === "P2025") return make("NOT_FOUND");
  if (error.code === "P2034" || state === SQLSTATE.SERIALIZATION || state === SQLSTATE.DEADLOCK) {
    return make("CONFLICT");
  }
  return null;
}

/** Rethrows a known database error as an AppError; anything else is rethrown unchanged. */
export function rethrowDbError(error: unknown): never {
  throw toDbAppError(error) ?? error;
}
