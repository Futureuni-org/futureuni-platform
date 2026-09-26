/**
 * The development seed runner (`pnpm db:seed`, run by `pnpm db:reset`; data-model §10).
 *
 * 1. Refuses production and any non-local database (SEED_ALLOW_REMOTE=1 allows a preview branch).
 * 2. Discovers `prisma/seed/seeders/*.ts` and every `src/** /seed.ts` (a module's own seeders),
 *    each a `defineSeeder({ name, order, run })` default export.
 * 3. Runs them in ascending order, each in its own transaction, with one fixed `now`
 *    (SEED_NOW=<ISO date> pins it, for reproducible screenshots).
 * 4. Prints a row count for every model.
 *
 * Every seeder is idempotent: running it twice leaves the same rows.
 */

import { glob } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";

import type { Seeder } from "@/platform/db";

const ROOT = join(import.meta.dirname, "..", "..");
const SEEDER_TIMEOUT_MS = 120_000;

interface LoadedSeeder extends Seeder {
  file: string;
}

function fail(message: string): never {
  console.error(`error ${message}`);
  process.exit(1);
}

function isSeeder(value: unknown): value is Seeder {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.order === "number" &&
    typeof candidate.run === "function"
  );
}

async function discover(): Promise<LoadedSeeder[]> {
  const files: string[] = [];
  for await (const file of glob(["prisma/seed/seeders/*.ts", "src/**/seed.ts"], {
    cwd: ROOT,
    exclude: (path) => path.includes("node_modules"),
  })) {
    if (!file.endsWith(".test.ts")) files.push(file.replaceAll("\\", "/"));
  }
  const seeders: LoadedSeeder[] = [];
  for (const file of files.sort()) {
    const loaded: unknown = await import(pathToFileURL(join(ROOT, file)).href);
    const seeder = (loaded as { default?: unknown }).default;
    if (!isSeeder(seeder)) fail(`${file} must default-export defineSeeder({ name, order, run }).`);
    seeders.push({ file, name: seeder.name, order: seeder.order, run: seeder.run });
  }
  const names = new Set<string>();
  for (const seeder of seeders) {
    if (names.has(seeder.name)) fail(`Two seeders are named "${seeder.name}".`);
    names.add(seeder.name);
  }
  return seeders.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

async function main(): Promise<void> {
  loadEnv({ path: [join(ROOT, ".env.local"), join(ROOT, ".env")], quiet: true });
  const { seedTargetProblem } = await import("./lib/guard");
  const problem = seedTargetProblem(process.env);
  if (problem !== null) fail(problem);

  // Imported only now: they read the environment loaded above.
  const { faker } = await import("@faker-js/faker");
  const { db, dbIncludingDeleted, disconnectDb, violatedConstraint } =
    await import("@/platform/db");
  const { countRows } = await import("./lib/counts");

  const pinned = process.env.SEED_NOW;
  const now = pinned === undefined || pinned === "" ? new Date() : new Date(pinned);
  if (Number.isNaN(now.getTime())) fail(`SEED_NOW isn't a valid date: "${pinned ?? ""}".`);
  faker.seed(20260925);

  // What the connection actually reached, not just what the URL says.
  if (process.env.SEED_ALLOW_REMOTE !== "1") {
    const { isLoopbackServer } = await import("./lib/guard");
    const [server] = await db.$queryRaw<{ address: string | null }[]>`
      SELECT host(inet_server_addr()) AS address`;
    if (!isLoopbackServer(server?.address ?? null)) {
      fail(
        `Refusing to seed: the database server isn't on this machine (${server?.address ?? "unknown"}).`,
      );
    }
  }

  const seeders = await discover();
  console.warn(`Seeding ${String(seeders.length)} seeders (now = ${now.toISOString()})`);
  try {
    for (const seeder of seeders) {
      const started = performance.now();
      const ctx = {
        now,
        faker,
        log: (message: string) => {
          console.warn(`      ${message}`);
        },
      };
      console.warn(
        `ok    ${seeder.name} (${relative(ROOT, join(ROOT, seeder.file)).replaceAll("\\", "/")})`,
      );
      try {
        await db.$transaction((tx) => seeder.run(tx, ctx), {
          timeout: SEEDER_TIMEOUT_MS,
          maxWait: 10_000,
        });
      } catch (error) {
        const constraint = violatedConstraint(error);
        const detail =
          error instanceof Error ? error.message.split("\n").filter(Boolean).at(-1) : String(error);
        fail(
          `seeder "${seeder.name}" failed${constraint === null ? "" : ` on ${constraint}`}: ${detail ?? "unknown error"}\n` +
            "      If your own changes clash with the seed data, start over with: pnpm db:reset",
        );
      }
      console.warn(`      done in ${String(Math.round(performance.now() - started))} ms`);
    }

    const counts = await countRows(dbIncludingDeleted);
    const width = Math.max(...counts.map(([model]) => model.length));
    console.warn("\nRows per model:");
    for (const [model, count] of counts.sort(([a], [b]) => a.localeCompare(b))) {
      console.warn(`  ${model.padEnd(width)}  ${String(count).padStart(5)}`);
    }
    console.warn(
      `  ${"Total".padEnd(width)}  ${String(counts.reduce((sum, [, count]) => sum + count, 0)).padStart(5)}`,
    );
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
