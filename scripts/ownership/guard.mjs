#!/usr/bin/env node
// Ownership guard: a Claude Code PreToolUse hook on the file-writing tools (.claude/settings.json).
//
// On a phase branch (phase/<nn>-<slug>) it allows a write only when the phase owns the path,
// has an alsoAllow grant for it, or the path is always allowed (phases/<nn>/**,
// tests/e2e/phase-<nn>/**). Otherwise it blocks the write (exit code 2; the message on stderr
// goes back to Claude). On any other branch, with FU_ALLOW_ALL=1, or for paths outside a git
// checkout, every write is allowed.
//
// The branch and the map come from the checkout that contains the target file, so an edit in a
// sibling phase worktree is judged by that worktree's branch.
// Writes made through a shell (Bash, PowerShell) don't reach this hook; `node
// scripts/ownership/check.mjs --phase-diff` checks a whole branch diff (pnpm phase finish, CI).
//
// Plain Node, no dependencies.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { decide, denialMessage, loadOwnershipMap, phaseFromBranch } from "./lib.mjs";

const BLOCK = 2;

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(BLOCK);
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

/** The closest folder of `path` that exists (the target file itself may not exist yet). */
function nearestExistingDir(path) {
  let dir = dirname(path);
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

/** Canonical path: on Windows this also restores the real letter case of existing folders. */
function canonical(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function loadMap(repoRoot) {
  const inCheckout = join(repoRoot, "scripts", "ownership", "ownership.json");
  const besideScript = join(dirname(fileURLToPath(import.meta.url)), "ownership.json");
  return loadOwnershipMap(existsSync(inCheckout) ? inCheckout : besideScript);
}

let phase = null;

function main() {
  if (process.env.FU_ALLOW_ALL === "1") return;

  const input = readInput();
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof target !== "string" || target === "") return;

  const base = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const absolute = resolve(base, target);
  const existingDir = nearestExistingDir(absolute);
  if (existingDir === null) return;

  const repoRoot = git(["rev-parse", "--show-toplevel"], existingDir);
  if (repoRoot === null) return; // not inside a git checkout: nothing to guard

  // symbolic-ref works on a branch with no commits yet, and fails (null) on a detached HEAD.
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"], repoRoot);
  if (branch === null || !branch.startsWith("phase/")) return; // main, merge or integration work

  phase = phaseFromBranch(branch);
  if (phase === null) {
    block(
      `Branch "${branch}" looks like a phase branch but isn't named phase/<nn>-<slug> (two digits, a lowercase slug). ` +
        "Rename it (git branch -m) before editing, so the ownership guard knows the phase.",
    );
  }

  const root = canonical(repoRoot);
  const full = join(canonical(existingDir), relative(existingDir, absolute));
  const relativePath = relative(root, full);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return; // outside this checkout
  }
  const path = relativePath.split(sep).join("/");

  const decision = decide({ path, phase, map: loadMap(root) });
  if (!decision.allowed) block(denialMessage(phase, path, decision.owner ?? null));
}

try {
  main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  // On a phase branch the guard fails closed; anywhere else a guard bug never blocks work.
  if (phase !== null) {
    block(
      `Ownership guard error (${reason}). Fix scripts/ownership/, or write the change you need to phases/${phase}/REQUESTS.md.`,
    );
  }
  process.stderr.write(`Ownership guard error (ignored outside a phase branch): ${reason}\n`);
}
