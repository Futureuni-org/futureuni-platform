/**
 * Test database helpers. Integration tests run against the test database only (futureuni_test,
 * or futureuni_test_p<nn> in a phase worktree); tests/setup/test-env.ts points DATABASE_URL at it.
 */

import { db, type Tx } from "@/platform/db";

const TEST_DATABASE = /^futureuni_test(?:_p\d{2})?$/;

const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
]);

/** Refuses to touch any database that isn't a local test database. */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const parsed = url === "" ? null : new URL(url);
  const name = parsed === null ? "" : decodeURIComponent(parsed.pathname.slice(1));
  if (!TEST_DATABASE.test(name)) {
    throw new Error(`Factories only write to a test database (futureuni_test*), not "${name}".`);
  }
  if (parsed === null || !LOCAL_HOSTS.has(parsed.hostname) || parsed.searchParams.has("host")) {
    throw new Error("Factories only write to a test database on this machine.");
  }
}

class RolledBack extends Error {}

/**
 * Runs `fn` in a transaction that is always rolled back, and returns what `fn` returned. Tests
 * leave no rows behind and never see each other's data, so test files can run in parallel.
 *
 * @example
 * it("matches by domain", () => withRollback(async (tx) => {
 *   const company = await createCompany(tx, { normalizedDomain: "example.com.ng" });
 *   expect((await findMatchingCompany(tx, { name: "X", website: "https://www.example.com.ng" }))?.company.id).toBe(company.id);
 * }));
 */
export async function withRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertTestDatabase();
  const outcome: { value?: T } = {};
  try {
    await db.$transaction(
      async (tx) => {
        outcome.value = await fn(tx);
        throw new RolledBack("rolled back by withRollback");
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
  }
  return outcome.value as T;
}
