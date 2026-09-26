/**
 * Readable, collision-free values for factories. Every process gets its own run prefix, so test
 * files running in parallel (and rows left by an earlier run) never collide on unique columns.
 */

import { randomBytes } from "node:crypto";

import { faker } from "@faker-js/faker";

/** Fixed seed (docs/specs/data-model.md §10.1), so fake secondary text reproduces run to run. */
faker.seed(20260925);
export { faker };

const RUN = randomBytes(3).toString("hex");
let counter = 0;

/** The next number in this process: 1, 2, 3… */
export function seq(): number {
  counter += 1;
  return counter;
}

/** A number no other process uses: for unique integer columns (a profile version number). */
export function uniqueInt(): number {
  return (Number.parseInt(RUN, 16) * 1_000 + seq()) % 2_000_000_000;
}

/** A unique token for unique columns, e.g. "a1b2c3-12". */
export function uniqueToken(): string {
  return `${RUN}-${String(seq())}`;
}

/** An address on a reserved test domain that can never be delivered. */
export function uniqueEmail(prefix = "person"): string {
  return `${prefix}.${uniqueToken()}@example.test`;
}

/** A registrable domain under the reserved .example TLD. */
export function uniqueDomain(prefix = "company"): string {
  return `${prefix}-${uniqueToken()}.example`;
}

/** A well-formed Nigerian mobile number in E.164 (+234 80x …). */
export function uniqueNigerianPhone(): string {
  return `+23480${String(1_0000_000 + (seq() % 9_000_000)).padStart(8, "0")}`;
}

/** A number in the UK's reserved drama range (+44 7700 900xxx). */
export function uniqueUkPhone(): string {
  return `+447700900${String(seq() % 1000).padStart(3, "0")}`;
}

/** A fixed instant for time-dependent tests; pass `clock` wherever a service takes one. */
export const FIXED_NOW = new Date("2026-10-03T09:00:00.000Z");
export const fixedClock = { now: () => FIXED_NOW };

/** An instant `days` before FIXED_NOW (negative for after). */
export function daysAgo(days: number, from: Date = FIXED_NOW): Date {
  return new Date(from.getTime() - days * 86_400_000);
}
