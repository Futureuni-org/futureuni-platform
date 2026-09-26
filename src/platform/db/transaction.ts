import "server-only";

import type { ITXClientDenyList } from "@prisma/client/runtime/client";

import { Prisma } from "@/generated/prisma/client";

import { db } from "./client";
import { isUniqueViolation, sqlState } from "./errors";

/** The database client type (with soft-delete scoping). */
export type Db = typeof db;

/**
 * A transaction client: what `withTransaction` passes to its callback. Helpers that must run
 * inside a transaction (for example `transitionLead`, INV-1) take a `Tx` as their first argument.
 * The root `db` is also a valid `Tx` for helpers that only read.
 */
export type Tx = Omit<Db, ITXClientDenyList>;

/** Default limits: long enough for a multi-step write, short enough to never hold locks for long. */
export const TRANSACTION_TIMEOUT_MS = 10_000;
export const TRANSACTION_MAX_WAIT_MS = 5_000;

export interface TransactionOptions {
  /** Maximum time the callback may run before the transaction is rolled back. */
  timeoutMs?: number;
  /** Maximum time to wait for a connection from the pool. */
  maxWaitMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Runs `fn` in one database transaction: everything commits together or nothing does.
 * Never call external services (email, HTTP, AI) inside: commit first, or write an outbox row.
 */
export function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return db.$transaction(fn, {
    timeout: options.timeoutMs ?? TRANSACTION_TIMEOUT_MS,
    maxWait: options.maxWaitMs ?? TRANSACTION_MAX_WAIT_MS,
    ...(options.isolationLevel === undefined ? {} : { isolationLevel: options.isolationLevel }),
  });
}

/** For the `tx: Tx | null` seam signatures: the given transaction, or the root client. */
export function dbOr(tx: Tx | null): Tx {
  return tx ?? db;
}

/** PostgreSQL: "SAVEPOINT can only be used in transaction blocks". */
const NO_ACTIVE_TRANSACTION = "25P01";

/** Savepoint names are unique per call: an internal counter, never input. */
let savepointCounter = 0;

/**
 * Runs `fn` so that a failure inside it can be caught without aborting the surrounding
 * transaction. In PostgreSQL any error aborts the whole transaction, so code that expects a unique
 * violation inside a transaction (a race on the directory's domain index, INV-9's one open thread)
 * wraps the risky write in a savepoint: on failure only `fn`'s work is rolled back and the error
 * is rethrown for the caller to handle. With the root client (no transaction) `fn` runs as is.
 *
 * Each call uses its own savepoint name and releases it after a rollback, so nested savepoints
 * roll back exactly their own work. If the rollback itself fails (the transaction already ended),
 * the original error is the one rethrown.
 */
export async function withSavepoint<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  savepointCounter += 1;
  const name = Prisma.raw(`fu_sp_${String(savepointCounter)}`);
  try {
    await tx.$executeRaw`SAVEPOINT ${name}`;
  } catch (error) {
    if (sqlState(error) === NO_ACTIVE_TRANSACTION) return fn();
    throw error;
  }
  let result: T;
  try {
    result = await fn();
  } catch (error) {
    try {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT ${name}`;
      await tx.$executeRaw`RELEASE SAVEPOINT ${name}`;
    } catch {
      // The transaction is already gone (for example it timed out): the original error matters.
    }
    throw error;
  }
  await tx.$executeRaw`RELEASE SAVEPOINT ${name}`;
  return result;
}

/**
 * Creates a row, or runs `onConflict` when the create hits the unique index `constraint`. Use it
 * instead of `upsert`, `findUnique`, `update` or `delete` for the schema's **partial** unique
 * indexes (see README.md): Prisma lists their columns as unique keys, but an upsert on them fails
 * (PostgreSQL can't match ON CONFLICT to a partial index) and a findUnique on them may return a
 * row outside the index's predicate.
 */
export async function createOrOnConflict<T>(
  tx: Tx,
  constraint: string,
  create: () => Promise<T>,
  onConflict: () => Promise<T>,
): Promise<T> {
  try {
    return await withSavepoint(tx, create);
  } catch (error) {
    if (isUniqueViolation(error, constraint)) return onConflict();
    throw error;
  }
}
