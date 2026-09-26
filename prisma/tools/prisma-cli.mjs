// Runs the Prisma CLI from node_modules without a shell (works the same on Windows and Linux).

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { REPO_ROOT } from "../../scripts/lib/env-file.mjs";

const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");

/**
 * Runs `prisma <args>` from the repository root with extra environment variables.
 * @param {string[]} args
 * @param {Record<string, string>} [env]
 * @returns {number} the exit code
 */
export function prisma(args, env = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

/** Prints a message and exits with code 1. */
export function fail(message) {
  console.error(`error ${message}`);
  process.exit(1);
}
