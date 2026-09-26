#!/usr/bin/env node
// CI only: fresh random values for every .env.example placeholder secret, written to $GITHUB_ENV
// and masked in the log, so builds and tests validate a complete environment without any real
// secret. Usage (GitHub Actions step): node scripts/ci-env.mjs

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { generatedSecrets } from "./env-init.mjs";
import { REPO_ROOT } from "./lib/env-file.mjs";

const target = process.env.GITHUB_ENV;
if (target === undefined || target === "") {
  console.error("GITHUB_ENV isn't set; this script only runs in GitHub Actions.");
  process.exit(1);
}

const secrets = generatedSecrets(readFileSync(join(REPO_ROOT, ".env.example"), "utf8"));
for (const [key, value] of Object.entries(secrets)) {
  process.stdout.write(`::add-mask::${value}\n`);
  appendFileSync(target, `${key}=${value}\n`);
}
process.stdout.write(`Generated CI values for: ${Object.keys(secrets).join(", ")}\n`);
