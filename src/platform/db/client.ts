import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

import { env } from "@/env";
import { PrismaClient } from "@/generated/prisma/client";

import { softDelete } from "./soft-delete";

/** In development, queries at least this slow are logged (SQL and duration only). */
const SLOW_QUERY_MS = 200;

/**
 * One connection path everywhere (ADR-019): Prisma over a `pg` Pool through @prisma/adapter-pg.
 * On Vercel, DATABASE_URL is Neon's pooled URL and `attachDatabasePool` lets Fluid Compute close
 * idle connections before a function instance is suspended. Locally it's native Postgres.
 */
function createClients() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  if (env.VERCEL === "1") attachDatabasePool(pool);
  const base = createBaseClient(new PrismaPg(pool));
  return { pool, base, db: base.$extends(softDelete) };
}

function createBaseClient(adapter: PrismaPg): PrismaClient {
  if (env.NODE_ENV !== "development") return new PrismaClient({ adapter, log: ["warn", "error"] });
  const client = new PrismaClient({
    adapter,
    log: [{ emit: "event", level: "query" }, "warn", "error"],
  });
  client.$on("query", (event) => {
    // Never the parameters: they can hold personal data.
    if (event.duration >= SLOW_QUERY_MS) {
      console.warn(`[db] slow query (${String(event.duration)} ms): ${event.query}`);
    }
  });
  return client;
}

type Clients = ReturnType<typeof createClients>;

// One set of clients per process, reused across hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { __futureuniDb?: Clients };
const clients = globalForDb.__futureuniDb ?? createClients();
if (env.NODE_ENV !== "production") globalForDb.__futureuniDb = clients;

/**
 * The database client. Reads of Company, Contact and FileObject exclude soft-deleted rows.
 * Code reaches the database only through here (or a `*.repo.ts` file using it).
 */
export const db = clients.db;

/**
 * The same connection without soft-delete scoping. Only for data-subject requests, the retention
 * purge and restoring a deleted record, which must see deleted rows.
 */
export const dbIncludingDeleted = clients.base;

/** Closes the client and its pool (scripts and test teardown). */
export async function disconnectDb(): Promise<void> {
  await clients.base.$disconnect();
  await clients.pool.end();
  if (globalForDb.__futureuniDb === clients) delete globalForDb.__futureuniDb;
}
