#!/usr/bin/env node
// pnpm db:up / pnpm db:down: start or stop local PostgreSQL (ADR-004), then make sure the
// development and test databases from .env.local exist. Safe to run repeatedly.
//
// native: pg_ctl against LOCAL_PGDATA. The server is started detached, in its own hidden
//         console, so closing the terminal doesn't stop it (on Windows a server tied to a
//         closing console loses its backends).
// docker: docker compose up -d --wait / docker compose down (docker-compose.yml).

import { spawn, spawnSync } from "node:child_process";

import {
  assertLocal,
  createDatabase,
  databaseExists,
  databaseName,
  localSettings,
  nativeInstallExists,
  nativePaths,
  pgTool,
  resolveMode,
  waitForServer,
  withClient,
  withDatabase,
} from "./lib/local-db.mjs";
import { REPO_ROOT } from "./lib/env-file.mjs";

const out = (line) => process.stdout.write(`${line}\n`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env,
    windowsHide: true,
  });
  if (result.error !== undefined) fail(`${command} failed: ${result.error.message}`);
  return result.status ?? 1;
}

/** pg_ctl status: 0 running, 3 not running, 4 no data directory. */
function nativeStatus(paths) {
  const result = spawnSync(pgTool(paths.bin, "pg_ctl"), ["status", "-D", paths.data], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (result.error !== undefined)
    fail(`Can't run pg_ctl (${result.error.message}). Set LOCAL_PG_BIN in .env.local.`);
  return result.status;
}

function startNative(paths) {
  const child = spawn(pgTool(paths.bin, "pg_ctl"), ["start", "-D", paths.data, "-l", paths.log], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function ensureDatabases(settings) {
  const urls = [settings.DATABASE_URL, settings.DATABASE_URL_TEST].filter(
    (url) => url !== undefined && url !== "",
  );
  if (urls.length === 0)
    fail("DATABASE_URL isn't set. Create .env.local with: node scripts/env-init.mjs");
  for (const url of urls) assertLocal(url);

  const admin = withDatabase(urls[0], "postgres");
  await waitForServer(admin);
  await withClient(admin, async (client) => {
    for (const url of urls) {
      const name = databaseName(url);
      if (await databaseExists(client, name)) {
        out(`ok    database ${name} exists`);
      } else {
        await createDatabase(client, name);
        out(`ok    created database ${name}`);
      }
    }
  });
}

async function up(settings, mode) {
  if (mode === "docker") {
    if (run("docker", ["compose", "up", "-d", "--wait"], { ...process.env, ...settings }) !== 0)
      fail("docker compose up failed.");
  } else {
    const paths = nativePaths(settings);
    if (!nativeInstallExists(paths)) {
      fail(
        `No PostgreSQL data directory at "${paths.data || "(not set)"}".\n` +
          "Install PostgreSQL 18 and initialise it (README: Local database), set LOCAL_PGDATA and LOCAL_PG_BIN in .env.local,\n" +
          "or use Docker with LOCAL_DB_MODE=docker.",
      );
    }
    if (nativeStatus(paths) === 0) {
      out("ok    PostgreSQL is already running");
    } else {
      startNative(paths);
      out(`...   starting PostgreSQL (log: ${paths.log})`);
    }
  }
  await ensureDatabases(settings);
  out(`ready local PostgreSQL (${mode} mode)`);
}

function down(settings, mode) {
  if (mode === "docker") {
    if (run("docker", ["compose", "down"], { ...process.env, ...settings }) !== 0)
      fail("docker compose down failed.");
    out("ok    stopped the PostgreSQL container (the data volume is kept)");
    return;
  }
  const paths = nativePaths(settings);
  if (nativeStatus(paths) !== 0) {
    out("ok    PostgreSQL isn't running");
    return;
  }
  if (run(pgTool(paths.bin, "pg_ctl"), ["stop", "-D", paths.data, "-m", "fast"], process.env) !== 0)
    fail("pg_ctl stop failed.");
  out("ok    stopped PostgreSQL");
}

const command = process.argv[2];
if (command !== "up" && command !== "down") fail("Usage: node scripts/db.mjs up|down");

const settings = localSettings();
const mode = resolveMode(settings);

try {
  if (command === "up") await up(settings, mode);
  else down(settings, mode);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
