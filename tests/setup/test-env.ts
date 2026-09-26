/*
 * The environment every test runs with, so modules that import `@/env` load.
 *
 * - Database: always the test database, never whatever DATABASE_URL a shell exports. It comes
 *   from DATABASE_URL_TEST (CI sets it) or this checkout's .env.local, so each phase worktree
 *   uses its own `futureuni_test_p<nn>`. Anything that isn't a test database is refused.
 * - MOCKS is always true: tests never reach a real provider.
 * - Other variables keep any value already set (for example by CI), else these defaults.
 *   None of these are real secrets.
 */

import { join } from "node:path";

import { readEnvFile, REPO_ROOT } from "../../scripts/lib/env-file.mjs";

const DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/futureuni_test";
const TEST_DATABASE_NAME = /^futureuni_test(?:_p\d{2})?$/;

export const TEST_ENV: Readonly<Record<string, string>> = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  MOCKS: "true",
  DATABASE_URL: DEFAULT_TEST_DATABASE_URL,
  DIRECT_URL: DEFAULT_TEST_DATABASE_URL,
  DATABASE_URL_TEST: DEFAULT_TEST_DATABASE_URL,
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "test-only-cron-secret-000000000000000",
  UNSUBSCRIBE_TOKEN_SECRET: "test-only-unsubscribe-secret-000000000",
  BOOKING_LINK_SECRET: "test-only-booking-link-secret-00000000",
  SUPPRESSION_HASH_KEY: "test-only-suppression-hash-key-0000000",
  BETTER_AUTH_SECRET: "test-only-better-auth-secret-000000000",
  BETTER_AUTH_URL: "http://localhost:3000",
};

const local = readEnvFile(join(REPO_ROOT, ".env.local"));
/** The first value that is set; blank values in .env files count as unset. */
const firstSet = (...values: (string | undefined)[]) =>
  values.find((value) => value !== undefined && value.trim() !== "");
const testDatabaseUrl =
  firstSet(process.env.DATABASE_URL_TEST, local.DATABASE_URL_TEST) ?? DEFAULT_TEST_DATABASE_URL;
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!TEST_DATABASE_NAME.test(testDatabaseName)) {
  throw new Error(
    `Tests run only against a test database (futureuni_test or futureuni_test_p<nn>), not "${testDatabaseName}". Check DATABASE_URL_TEST.`,
  );
}

process.env.DATABASE_URL_TEST = testDatabaseUrl;
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = testDatabaseUrl;
process.env.MOCKS = "true";

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] ??= value;
}
