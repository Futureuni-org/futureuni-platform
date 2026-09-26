import type { Prisma } from "@/generated/prisma/client";

/**
 * A contract-typed value as a Prisma JSON column input. Contract types often carry `unknown`
 * (for example `SourceConfig.defaultParams`) or optional fields, which Prisma's `InputJsonValue`
 * doesn't accept. A JSON round trip makes the value plain JSON (undefined fields dropped, dates as
 * ISO strings), so the one cast here is exact. Validate the value with its contract schema first
 * (data-model §7: every JSON column is validated on write).
 */
export function toJsonInput(value: unknown): Prisma.InputJsonValue {
  // JSON.stringify returns undefined for undefined (and functions), whatever its type says.
  const text = JSON.stringify(value) as string | undefined;
  const json: unknown = text === undefined ? null : JSON.parse(text);
  if (json === null) {
    throw new TypeError(
      "A JSON column value can't be null here; pass Prisma.JsonNull or Prisma.DbNull.",
    );
  }
  return json as Prisma.InputJsonValue;
}
