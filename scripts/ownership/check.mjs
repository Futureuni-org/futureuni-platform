#!/usr/bin/env node
// Ownership map checks.
//
//   node scripts/ownership/check.mjs
//     The map itself (CI, and every wave's prep step). Fails (exit 1) when the map is malformed or
//     a pattern is claimed by two phases. Warns when the map and the CLAUDE.md table differ, when
//     a tracked file has no owner, and when a folder in the map has no README.md.
//
//   node scripts/ownership/check.mjs --phase-diff [--branch <name>] [--base <ref>]
//     A phase branch's whole diff against <base> (default main): committed, uncommitted and
//     untracked files. Fails when the phase changed a path it may not edit. This catches writes
//     the Claude Code hook can't see (Bash, PowerShell). `pnpm phase finish` and CI run it.
//     FU_ALLOW_ALL=1 skips it (Phase 19 and merge work; list those files in the summary).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareWithClaudeTable,
  decide,
  denialMessage,
  findDuplicateOwners,
  folderOf,
  loadOwnershipMap,
  ownerOf,
  parseClaudeOwnershipTable,
  phaseFromBranch,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const out = (line) => process.stdout.write(`${line}\n`);

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lines(text) {
  return text.split(/\r?\n/).filter(Boolean);
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

let map;
try {
  map = loadOwnershipMap(join(here, "ownership.json"));
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function checkPhaseDiff(args) {
  if (process.env.FU_ALLOW_ALL === "1") {
    console.warn(
      "warn  FU_ALLOW_ALL=1: the branch diff wasn't checked. List the files changed that way in the summary.",
    );
    return true;
  }
  const branch =
    optionValue(args, "--branch") ?? git(["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
  const base = optionValue(args, "--base") ?? "main";
  if (!branch.startsWith("phase/")) {
    out(`skip  ${branch} isn't a phase branch; nothing to check`);
    return true;
  }
  const phase = phaseFromBranch(branch);
  if (phase === null) {
    console.error(`ERROR branch "${branch}" isn't named phase/<nn>-<slug>`);
    return false;
  }

  const mergeBase = git(["merge-base", base, "HEAD"]).trim();
  const changed = new Set([
    ...lines(git(["diff", "--name-only", "--no-renames", mergeBase])),
    ...lines(git(["ls-files", "--others", "--exclude-standard"])),
  ]);
  const refused = [...changed]
    .sort()
    .map((path) => ({ path, decision: decide({ path, phase, map }) }))
    .filter(({ decision }) => !decision.allowed);

  for (const { path, decision } of refused) {
    console.error(`ERROR ${denialMessage(phase, path, decision.owner ?? null)}`);
  }
  if (refused.length === 0) {
    out(
      `ok    every path phase ${phase} changed against ${base} (${String(changed.size)}) is one it may edit`,
    );
  }
  return refused.length === 0;
}

function checkMap() {
  let ok = true;

  // 1. Exactly one owner per pattern.
  const duplicates = findDuplicateOwners(map);
  for (const { pattern, phases } of duplicates) {
    console.error(
      `ERROR ${pattern} is claimed by phases ${phases.join(", ")}; each path needs exactly one owner.`,
    );
    ok = false;
  }
  if (duplicates.length === 0) out("ok    no pattern is claimed by two phases");

  // 2. The CLAUDE.md table is the human-readable copy of this map.
  const claudePath = join(repoRoot, "CLAUDE.md");
  if (existsSync(claudePath)) {
    const differences = compareWithClaudeTable(
      map,
      parseClaudeOwnershipTable(readFileSync(claudePath, "utf8")),
    );
    for (const { phase, pattern, missingFrom } of differences) {
      console.warn(`warn  phase ${phase}: ${pattern} is missing from ${missingFrom}`);
    }
    if (differences.length === 0) out("ok    ownership.json matches the CLAUDE.md table");
  }

  // 3. Every tracked file has an owner (phase folders belong to their phase).
  let tracked = [];
  try {
    tracked = lines(git(["ls-files"]));
  } catch {
    console.warn("warn  git ls-files failed; skipped the unowned-file check");
  }
  const unowned = tracked.filter(
    (path) =>
      !/^phases\/\d{2}\//.test(path) &&
      !/^tests\/e2e\/phase-\d{2}\//.test(path) &&
      ownerOf(path, map) === undefined,
  );
  for (const path of unowned) console.warn(`warn  no phase owns ${path}`);
  if (tracked.length > 0 && unowned.length === 0) {
    out(`ok    every tracked file (${String(tracked.length)}) has an owner`);
  }

  // 4. Every folder a phase owns outright has a README.md saying who owns it (created by Phase 1).
  //    Skipped: dot folders, Phase 0's docs, public/ (anything there is served) and generated code.
  const skipFolder = (folder) =>
    folder.startsWith(".") ||
    folder.startsWith("docs") ||
    folder.startsWith("public") ||
    folder.startsWith("src/generated");
  const folders = new Set(
    Object.values(map.phases)
      .flatMap((entry) => entry.owns)
      .map(folderOf)
      .filter((folder) => folder !== null && !skipFolder(folder)),
  );
  const withoutReadme = [...folders]
    .filter((folder) => !existsSync(join(repoRoot, folder, "README.md")))
    .sort();
  for (const folder of withoutReadme) console.warn(`warn  ${folder}/ has no README.md`);
  if (withoutReadme.length === 0)
    out(`ok    every mapped folder (${String(folders.size)}) has a README.md`);

  return ok;
}

const args = process.argv.slice(2);
let passed;
try {
  passed = args.includes("--phase-diff") ? checkPhaseDiff(args) : checkMap();
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  passed = false;
}
process.exit(passed ? 0 : 1);
