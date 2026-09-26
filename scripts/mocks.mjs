#!/usr/bin/env node
// Switches mock providers on or off in .env.local (ADR-005).
// Usage: pnpm mocks:on | pnpm mocks:off   (restart pnpm dev afterwards)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, setEnvValues } from "./lib/env-file.mjs";

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("Usage: node scripts/mocks.mjs on|off");
  process.exit(1);
}

const localPath = join(REPO_ROOT, ".env.local");
if (!existsSync(localPath)) {
  console.error(".env.local doesn't exist yet. Create it with: node scripts/env-init.mjs");
  process.exit(1);
}

writeFileSync(
  localPath,
  setEnvValues(readFileSync(localPath, "utf8"), { MOCKS: mode === "on" ? "true" : "false" }),
);
console.warn(
  `MOCKS=${mode === "on" ? "true" : "false"} in .env.local. Restart pnpm dev to apply it.`,
);
