// Local PostgreSQL helpers shared by db.mjs (pnpm db:up / db:down) and phase.mjs (worktrees).
// Two modes (ADR-004): "native" (pg_ctl on this machine, the build laptop's setup) and
// "docker" (docker-compose.yml). LOCAL_DB_MODE chooses; unset means docker when the docker
// command works, otherwise native.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import pg from "pg";

import { readEnvFile, REPO_ROOT } from "./env-file.mjs";

const isWindows = process.platform === "win32";

/** Script settings: the process environment wins over .env.local; blank values count as unset. */
export function localSettings(root = REPO_ROOT) {
  return { ...definedOnly(readEnvFile(join(root, ".env.local"))), ...definedOnly(process.env) };
}

function definedOnly(source) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
}

export function dockerAvailable() {
  const result = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

export function resolveMode(settings, hasDocker = dockerAvailable) {
  const mode = settings.LOCAL_DB_MODE;
  if (mode === "native" || mode === "docker") return mode;
  if (mode !== undefined && mode !== "")
    throw new Error(`LOCAL_DB_MODE must be "native" or "docker", not "${mode}"`);
  return hasDocker() ? "docker" : "native";
}

/** Where the native binaries and data directory are (defaults: the per-user Windows install). */
export function nativePaths(settings, platformIsWindows = isWindows) {
  const localAppData = settings.LOCALAPPDATA ?? "";
  const bin =
    settings.LOCAL_PG_BIN ??
    (platformIsWindows && localAppData
      ? join(localAppData, "Programs", "PostgreSQL", "18", "bin")
      : "");
  const data =
    settings.LOCAL_PGDATA ??
    (platformIsWindows && localAppData ? join(localAppData, "PostgreSQL", "18", "data") : "");
  return { bin, data, log: data ? join(dirname(data), "postgres.log") : "" };
}

/** A PostgreSQL command-line tool, from LOCAL_PG_BIN or the PATH. */
export function pgTool(bin, name) {
  if (!bin) return name;
  return join(bin, isWindows ? `${name}.exe` : name);
}

export function nativeInstallExists(paths) {
  return Boolean(paths.data) && existsSync(join(paths.data, "PG_VERSION"));
}

const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

/** The database name in a connection string. */
export function databaseName(url) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!DATABASE_NAME.test(name))
    throw new Error(`unexpected database name "${name}" in a connection string`);
  return name;
}

/** The same server, connected to another database (for example "postgres" for admin work). */
export function withDatabase(url, name) {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
}

/** Only databases on this machine are touched by the local scripts. */
export function assertLocal(url) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(
      `refusing to manage a non-local database (${host}); the local scripts only touch localhost`,
    );
  }
}

function quoteIdentifier(name) {
  if (!DATABASE_NAME.test(name)) throw new Error(`unsafe database name "${name}"`);
  return `"${name}"`;
}

/** Runs `fn` with a connected client, always closing it. */
export async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function databaseExists(client, name) {
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  return result.rowCount === 1;
}

/** CREATE DATABASE, optionally copying a template (the SQL behind `createdb -T`). */
export async function createDatabase(client, name, template) {
  const from = template === undefined ? "" : ` TEMPLATE ${quoteIdentifier(template)}`;
  await client.query(`CREATE DATABASE ${quoteIdentifier(name)}${from}`);
}

/** DROP DATABASE, disconnecting any sessions first (Postgres 13+). */
export async function dropDatabase(client, name) {
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
}

/** Waits until the server accepts connections, or throws after `timeoutMs`. */
export async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await withClient(url, async (client) => client.query("SELECT 1"));
      return;
    } catch (error) {
      lastError = error;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  throw new Error(
    `PostgreSQL didn't accept connections within ${String(timeoutMs / 1000)}s: ${String(lastError)}`,
  );
}
