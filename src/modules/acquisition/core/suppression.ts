import "server-only";

import { createHmac } from "node:crypto";

import type { SuppressionReason, SuppressionType } from "@/contracts/common";
import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { dbOr, type Tx } from "@/platform/db";
import { emailDomain, normalizeDomain, normalizeEmail, normalizePhone } from "@/platform/directory";

import { findLiveSuppressions } from "./suppression.repo";

/**
 * The suppression check every send path calls (INV-2), before any send and before an assisted
 * link is generated. Values are normalised with the directory normalisers, the email's own domain
 * is checked against DOMAIN suppressions, and email and phone are also checked in their keyed-hash
 * form, which is how a data-subject deletion keeps someone suppressed without keeping their
 * address (data-model §8.3).
 */

export interface SuppressionCheck {
  email?: string | null;
  phone?: string | null;
  /** A website URL or domain; reduced to its registrable domain. */
  domain?: string | null;
  /** ISO 3166-1 alpha-2 country for a phone number written without its country code. */
  defaultCountry?: string | null;
}

export interface SuppressionMatch {
  id: string;
  type: SuppressionType;
  reason: SuppressionReason;
  isHashed: boolean;
}

/**
 * The keyed hash stored for data-subject deletions: HMAC-SHA256 with SUPPRESSION_HASH_KEY, as hex,
 * of the normalised value. A keyed hash (not a bare SHA-256) can't be reversed by hashing a list
 * of known addresses. Phase 9 writes DSR suppressions with this function.
 */
export function hashSuppressionValue(normalizedValue: string): string {
  return createHmac("sha256", env.SUPPRESSION_HASH_KEY).update(normalizedValue).digest("hex");
}

/**
 * A value as suppressions store it: lower-case email, E.164 phone, registrable domain. Null when
 * the value can't be normalised (then it can't be suppressed or matched).
 */
export function normalizeSuppressionValue(
  type: SuppressionType,
  raw: string,
  defaultCountry?: string | null,
): string | null {
  if (type === "EMAIL") return normalizeEmail(raw);
  if (type === "PHONE") return normalizePhone(raw, defaultCountry);
  return normalizeDomain(raw);
}

const isGiven = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.trim() !== "";

/**
 * Every live suppression that matches the email, phone or domain (ids, types and reasons only).
 * Fails closed: an email or phone that's given but can't be normalised (so can't be checked)
 * throws VALIDATION_FAILED rather than passing unchecked. Pass `defaultCountry` for a national
 * phone number.
 */
export async function findSuppressions(
  tx: Tx | null,
  check: SuppressionCheck,
): Promise<SuppressionMatch[]> {
  const email = normalizeEmail(check.email);
  const phone = normalizePhone(check.phone, check.defaultCountry);
  if (isGiven(check.email) && email === null) {
    throw new AppError(
      "VALIDATION_FAILED",
      "That email address can't be checked against the suppression list.",
    );
  }
  if (isGiven(check.phone) && phone === null) {
    throw new AppError(
      "VALIDATION_FAILED",
      "That phone number can't be checked against the suppression list.",
    );
  }
  const domains = [normalizeDomain(check.domain), emailDomain(email)].filter(
    (domain): domain is string => domain !== null,
  );
  return findLiveSuppressions(dbOr(tx), {
    EMAIL: email === null ? [] : [email, hashSuppressionValue(email)],
    PHONE: phone === null ? [] : [phone, hashSuppressionValue(phone)],
    DOMAIN: [...new Set(domains)],
  });
}

/** True when the email, phone or domain is on the suppression list (INV-2). */
export async function isSuppressed(tx: Tx | null, check: SuppressionCheck): Promise<boolean> {
  return (await findSuppressions(tx, check)).length > 0;
}

/**
 * Throws AppError("SUPPRESSED") when the email, phone or domain is suppressed (INV-2). The error
 * names which kinds matched, never the values.
 */
export async function assertNotSuppressed(tx: Tx | null, check: SuppressionCheck): Promise<void> {
  const matches = await findSuppressions(tx, check);
  if (matches.length > 0) {
    throw new AppError("SUPPRESSED", undefined, {
      details: { types: [...new Set(matches.map((match) => match.type))] },
    });
  }
}
