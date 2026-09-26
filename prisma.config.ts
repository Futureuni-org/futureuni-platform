/**
 * Prisma CLI configuration (Prisma 7, ADR-019).
 *
 * - The multi-file schema lives in prisma/schema/; migrations in prisma/migrations/.
 * - Migrations use the direct (non-pooled) connection, DIRECT_URL. The app itself connects
 *   through src/platform/db with the pooled DATABASE_URL.
 * - Prisma 7 loads no env file itself. Like Next.js, this reads .env.local and then .env,
 *   and never overrides a variable the shell already exported.
 * - Seeding runs only through `pnpm db:seed` (Prisma 7 no longer seeds on migrate or reset).
 *   The `react-server` condition lets seeders import server-only modules.
 */

import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed/index.ts",
  },
  datasource: {
    // Read leniently: `prisma generate` and `prisma validate` need no database, and CI runs
    // them before its environment step. Commands that do need one fail with Prisma's own error.
    url: process.env.DIRECT_URL ?? "",
    // Only for the drift check (pnpm db:validate creates a throwaway one locally).
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
