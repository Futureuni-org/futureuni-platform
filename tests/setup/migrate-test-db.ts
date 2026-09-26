/*
 * Vitest global setup: applies pending migrations to the test database before any test runs, so
 * a fresh checkout or phase worktree never tests against an empty schema. Uses the same test
 * database as tests/setup/test-env.ts (DATABASE_URL_TEST, else this checkout's .env.local, else
 * the default), and refuses anything that isn't a local futureuni_test* database.
 */

import { join } from "node:path";

import { prisma } from "../../prisma/tools/prisma-cli.mjs";
import { readEnvFile, REPO_ROOT } from "../../scripts/lib/env-file.mjs";

const DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/futureuni_test";
const TEST_DATABASE_NAME = /^futureuni_test(?:_p\d{2})?$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

export default function setup(): void {
  const local = readEnvFile(join(REPO_ROOT, ".env.local"));
  const candidates = [process.env.DATABASE_URL_TEST, local.DATABASE_URL_TEST];
  const url =
    candidates.find((value) => value !== undefined && value.trim() !== "") ??
    DEFAULT_TEST_DATABASE_URL;
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!TEST_DATABASE_NAME.test(name) || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to migrate "${name}": tests use a local futureuni_test* database.`);
  }
  if (prisma(["migrate", "deploy"], { DATABASE_URL: url, DIRECT_URL: url }) !== 0) {
    throw new Error(
      "Couldn't apply migrations to the test database. Is PostgreSQL running (pnpm db:up)?",
    );
  }
}
