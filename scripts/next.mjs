#!/usr/bin/env node
// Runs `next dev` or `next start` on the right port.
// Next.js ignores PORT in .env files (the server starts before they load), so this reads PORT
// from the environment or .env.local. Each phase worktree has its own PORT (3000 + phase number).
// Usage: node scripts/next.mjs dev|start [more next options]

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

import { readEnvFile, REPO_ROOT } from "./lib/env-file.mjs";

const [command, ...rest] = process.argv.slice(2);
if (command !== "dev" && command !== "start") {
  console.error("Usage: node scripts/next.mjs dev|start [next options]");
  process.exit(1);
}

const port = process.env.PORT ?? readEnvFile(join(REPO_ROOT, ".env.local")).PORT ?? "3000";
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

// PORT is also passed in the environment: Vercel Workflow's local world uses it to call back.
const child = spawn(process.execPath, [nextBin, command, "--port", port, ...rest], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: { ...process.env, PORT: port },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal === null ? 0 : 1));
});
