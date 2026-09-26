#!/usr/bin/env node
// pnpm phase start|list|finish|remove: parallel phase worktrees (phases/README.md §Worktrees).
//
// start <nn> <slug>  ../<repo>-<nn>-<slug> on branch phase/<nn>-<slug> from main, with a copy of
//                    .env.local pointing at its own databases (futureuni_p<nn>, futureuni_test_p<nn>,
//                    cloned from the main ones with CREATE DATABASE ... TEMPLATE, the SQL behind
//                    `createdb -T`) and its own port (3000 + nn); then pnpm install.
// list               phase worktrees with branch, port and uncommitted changes.
// finish <nn>        checks phases/<nn>/SUMMARY.md, runs pnpm check there, prints the merge steps.
//                    It never merges.
// remove <nn>        removes the worktree, drops its databases and deletes the branch if merged.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { readEnvFile, REPO_ROOT, setEnvValues } from "./lib/env-file.mjs";
import {
  assertLocal,
  createDatabase,
  databaseExists,
  databaseName,
  dropDatabase,
  withClient,
  withDatabase,
} from "./lib/local-db.mjs";
import {
  branchName,
  mergeProcedure,
  parsePhaseArgs,
  parseWorktreeList,
  phaseDatabases,
  phaseEnvValues,
  phasePort,
  worktreePath,
} from "./lib/phase-helpers.mjs";

const out = (line = "") => process.stdout.write(`${line}\n`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** The main checkout (worktrees share its .git folder), so sibling names stay stable. */
function mainRoot() {
  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return resolve(commonDir, "..");
}

/** Runs pnpm in a folder, using the pnpm that launched this script when there is one. */
function pnpm(args, cwd) {
  const execPath = process.env.npm_execpath;
  const result =
    execPath !== undefined && execPath !== ""
      ? spawnSync(process.execPath, [execPath, ...args], { cwd, stdio: "inherit" })
      : spawnSync("pnpm", args, { cwd, stdio: "inherit", shell: true });
  return result.status ?? 1;
}

function samePath(a, b) {
  const normalise = (path) => {
    const resolved = resolve(path);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalise(a) === normalise(b);
}

/**
 * Checkouts on a phase branch. The main folder is included only when asked (a sequential phase
 * runs there): it's never listed as, or removed like, a parallel worktree.
 */
function phaseWorktrees(root, { includeMain = false } = {}) {
  return parseWorktreeList(git(["worktree", "list", "--porcelain"], root)).filter(
    (entry) =>
      entry.branch?.startsWith("phase/") === true && (includeMain || !samePath(entry.path, root)),
  );
}

function findWorktree(root, nn, options) {
  const match = phaseWorktrees(root, options).find(
    (entry) => entry.branch?.startsWith(`phase/${nn}-`) === true,
  );
  if (match === undefined) fail(`No worktree for phase ${nn}. See: pnpm phase list`);
  return match;
}

/** The local server's admin connection, from the main .env.local (never the shell). */
async function localAdminUrl(mainEnv) {
  if (!mainEnv.DATABASE_URL) fail("DATABASE_URL is missing from the main .env.local.");
  const admin = withDatabase(mainEnv.DATABASE_URL, "postgres");
  assertLocal(admin);
  try {
    await withClient(admin, async (client) => client.query("SELECT 1"));
  } catch (error) {
    fail(
      `Can't reach local PostgreSQL (${error instanceof Error ? error.message : String(error)}). Start it with: pnpm db:up`,
    );
  }
  return admin;
}

/** Creates one phase database from its template; returns false if it had to start empty. */
async function cloneDatabase(client, name, template) {
  if (await databaseExists(client, name)) {
    out(`ok    database ${name} already exists; reusing it`);
    return true;
  }
  try {
    await createDatabase(client, name, template);
    out(`ok    created ${name} from ${template}`);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    out(`warn  couldn't copy ${template} (${reason})`);
    out(
      "      Postgres can't copy a database while another session uses it: stop pnpm dev and Prisma Studio in the main folder.",
    );
    await createDatabase(client, name);
    out(`ok    created an empty ${name}; it will be migrated and seeded`);
    return false;
  }
}

async function start({ nn, slug }) {
  const root = mainRoot();
  const target = worktreePath(root, nn, slug);
  const branch = branchName(nn, slug);
  const mainEnvPath = join(root, ".env.local");

  if (!existsSync(mainEnvPath))
    fail("The main folder has no .env.local. Create it with: node scripts/env-init.mjs");
  if (existsSync(target)) fail(`${target} already exists.`);
  if (phaseWorktrees(root).some((entry) => entry.branch?.startsWith(`phase/${nn}-`) === true)) {
    fail(`Phase ${nn} already has a worktree. See: pnpm phase list`);
  }

  const mainEnv = readEnvFile(mainEnvPath);
  const values = phaseEnvValues(mainEnv, nn);
  for (const url of [values.DATABASE_URL, values.DATABASE_URL_TEST]) assertLocal(url);
  // Check the database first, so a stopped server leaves nothing half-created.
  const admin = await localAdminUrl(mainEnv);

  out(`...   creating ${target} on ${branch} from main`);
  git(["worktree", "add", "-b", branch, target, "main"], root);

  writeFileSync(
    join(target, ".env.local"),
    setEnvValues(readFileSync(mainEnvPath, "utf8"), values),
  );
  out(`ok    wrote .env.local (port ${values.PORT})`);

  const { dev, test } = phaseDatabases(nn);
  let cloned = true;
  try {
    await withClient(admin, async (client) => {
      cloned = (await cloneDatabase(client, dev, databaseName(mainEnv.DATABASE_URL))) && cloned;
      cloned =
        (await cloneDatabase(
          client,
          test,
          databaseName(mainEnv.DATABASE_URL_TEST || mainEnv.DATABASE_URL),
        )) && cloned;
    });
  } catch (error) {
    fail(
      `Couldn't create the phase databases: ${error instanceof Error ? error.message : String(error)}\nIs PostgreSQL running? Try: pnpm db:up`,
    );
  }

  out("...   pnpm install");
  if (pnpm(["install"], target) !== 0) fail("pnpm install failed in the worktree.");

  if (!cloned && existsSync(join(target, "prisma", "schema"))) {
    out("...   migrating and seeding the empty databases");
    if (pnpm(["exec", "prisma", "migrate", "deploy"], target) !== 0)
      fail("prisma migrate deploy failed.");
    if (pnpm(["db:seed"], target) !== 0) fail("pnpm db:seed failed.");
  }

  mkdirSync(join(target, "phases", nn), { recursive: true });

  out();
  out(`Phase ${nn} worktree is ready.`);
  out(`  folder    ${target}`);
  out(`  branch    ${branch}`);
  out(
    `  port      ${String(phasePort(nn))} (pnpm dev serves http://localhost:${String(phasePort(nn))})`,
  );
  out(`  databases ${dev}, ${test}`);
  out();
  out("Next:");
  out(`  cd "${target}"`);
  out("  claude");
}

function list() {
  const worktrees = phaseWorktrees(mainRoot());
  if (worktrees.length === 0) {
    out("No phase worktrees. Start one with: pnpm phase start <nn> <slug>");
    return;
  }
  for (const entry of worktrees) {
    const port = readEnvFile(join(entry.path, ".env.local")).PORT ?? "?";
    const dirty = git(["status", "--porcelain"], entry.path) !== "";
    out(
      `${entry.branch ?? "?"}  port ${port}  ${dirty ? "uncommitted changes" : "clean"}  ${entry.path}`,
    );
  }
}

function finish({ nn }) {
  const root = mainRoot();
  // A sequential phase runs in the main folder, so it counts here.
  const worktree = findWorktree(root, nn, { includeMain: true });
  const summary = join(worktree.path, "phases", nn, "SUMMARY.md");
  if (!existsSync(summary))
    fail(`phases/${nn}/SUMMARY.md is missing in ${worktree.path}. Write it before finishing.`);
  out(`ok    phases/${nn}/SUMMARY.md exists`);

  out("...   ownership of every changed path (including shell writes the hook can't see)");
  const ownership = spawnSync(
    process.execPath,
    [join(worktree.path, "scripts", "ownership", "check.mjs"), "--phase-diff"],
    { cwd: worktree.path, stdio: "inherit" },
  );
  if (ownership.status !== 0) {
    fail(
      `Phase ${nn} changed paths it doesn't own. Move those changes to phases/${nn}/REQUESTS.md.`,
    );
  }

  out("...   pnpm check (lint, typecheck, test, build) in the worktree");
  if (pnpm(["check"], worktree.path) !== 0) fail("pnpm check failed. Fix it before merging.");
  out("ok    pnpm check passed");

  out();
  out(`Merge ${worktree.branch ?? `phase ${nn}`} from the main folder (nothing was merged):`);
  out();
  out(mergeProcedure(readFileSync(join(root, "phases", "README.md"), "utf8")));
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function remove({ nn, yes, force }) {
  const root = mainRoot();
  const worktree = findWorktree(root, nn);
  const { dev, test } = phaseDatabases(nn);

  if (!yes && !(await confirm(`Remove ${worktree.path} and drop ${dev} and ${test}?`))) {
    out("Nothing removed.");
    return;
  }

  // Check the database first, so a stopped server doesn't leave a half-removed phase.
  const admin = await localAdminUrl(readEnvFile(join(root, ".env.local")));

  try {
    git(["worktree", "remove", ...(force ? ["--force"] : []), worktree.path], root);
  } catch (error) {
    const detail =
      error instanceof Error && "stderr" in error ? String(error.stderr).trim() : String(error);
    fail(
      `git worktree remove failed: ${detail}\nCommit or discard its changes first, or pass --force to lose them.`,
    );
  }
  out(`ok    removed ${worktree.path}`);

  await withClient(admin, async (client) => {
    for (const name of [dev, test]) {
      await dropDatabase(client, name);
      out(`ok    dropped ${name} (if it existed)`);
    }
  });

  if (worktree.branch !== null) {
    try {
      git(["branch", "-d", worktree.branch], root);
      out(`ok    deleted branch ${worktree.branch}`);
    } catch {
      out(
        `keep  branch ${worktree.branch} has commits that aren't merged into main, so it was kept`,
      );
    }
  }
}

let parsed;
try {
  parsed = parsePhaseArgs(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

try {
  if (parsed.command === "start") await start(parsed);
  else if (parsed.command === "list") list();
  else if (parsed.command === "finish") finish(parsed);
  else await remove(parsed);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
