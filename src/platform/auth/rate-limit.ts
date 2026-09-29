/**
 * A thin rate limiter for server actions we own (invite creation, invite acceptance).
 *
 * Better Auth's DB-backed limiter covers its own endpoints (`/sign-in/email`, `/forget-password`,
 * `/two-factor/*`, …) through `customRules` in auth.ts. Our server actions don't route through
 * that middleware, so we increment the same `rate_limits` table by hand keyed by
 * `<bucket>:<subject>`. This keeps the shape identical, and lets us drop the bespoke helper if
 * Better Auth grows a route matcher we can bind.
 */

import "server-only";

import { AppError } from "@/lib/errors";
import { isUniqueViolation, withTransaction } from "@/platform/db";

export interface RateLimit {
  bucket: string;
  windowMs: number;
  max: number;
}

/**
 * Consume one credit; throws `AppError("RATE_LIMITED")` when the window has been exhausted.
 *
 * The whole check-and-set runs in a transaction, and the create path also catches the
 * unique-constraint violation that a concurrent caller could produce (two consumers racing an
 * empty row): the second consumer falls back to the update path and does not surface an
 * unhandled INTERNAL error.
 */
export async function consume(limit: RateLimit, subject: string): Promise<void> {
  const key = `${limit.bucket}:${subject}`;
  const now = Date.now();
  const windowStart = BigInt(now - limit.windowMs);

  const result = await withTransaction(async (tx) => {
    const existing = await tx.rateLimit.findUnique({
      where: { key },
      select: { count: true, lastRequest: true },
    });
    if (existing === null) {
      try {
        await tx.rateLimit.create({ data: { key, count: 1, lastRequest: BigInt(now) } });
        return { ok: true as const };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Fall through to the update path with a fresh read.
      }
    }
    const row =
      existing ??
      (await tx.rateLimit.findUnique({
        where: { key },
        select: { count: true, lastRequest: true },
      }));
    if (row === null) {
      // Shouldn't happen: something deleted the row between the create attempt and this read.
      return { ok: true as const };
    }
    const withinWindow = row.lastRequest >= windowStart;
    const nextCount = withinWindow ? row.count + 1 : 1;
    if (nextCount > limit.max) return { ok: false as const };
    await tx.rateLimit.update({
      where: { key },
      data: { count: nextCount, lastRequest: BigInt(now) },
    });
    return { ok: true as const };
  });

  if (!result.ok) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Wait a moment and try again.", {
      details: { bucket: limit.bucket },
    });
  }
}

export const INVITE_CREATE_LIMIT: RateLimit = {
  bucket: "auth:invite:create",
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
};

export const INVITE_ACCEPT_LIMIT: RateLimit = {
  bucket: "auth:invite:accept",
  windowMs: 60 * 60 * 1000,
  max: 10,
};
