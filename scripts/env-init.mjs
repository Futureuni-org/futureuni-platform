#!/usr/bin/env node
// Creates .env.local from .env.example for local development, with fresh random secrets.
// Usage: node scripts/env-init.mjs
// It never overwrites an existing .env.local.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseEnvText, REPO_ROOT, setEnvValues } from "./lib/env-file.mjs";

/** Keys whose .env.example value is a REPLACE_WITH_* placeholder get a random value. */
export function generatedSecrets(exampleText, random = randomBytes) {
  const values = {};
  for (const [key, value] of Object.entries(parseEnvText(exampleText))) {
    if (!value.startsWith("REPLACE_WITH")) continue;
    // The vault key must be exactly 32 bytes as base64; other secrets just need 32+ characters.
    values[key] =
      key === "CREDENTIALS_ENCRYPTION_KEY"
        ? random(32).toString("base64")
        : random(32).toString("base64url");
  }
  return values;
}

/** The .env.local text: .env.example with the placeholders filled. */
export function renderEnvLocal(exampleText, random = randomBytes) {
  return setEnvValues(exampleText, generatedSecrets(exampleText, random));
}

function main() {
  const examplePath = join(REPO_ROOT, ".env.example");
  const localPath = join(REPO_ROOT, ".env.local");
  if (existsSync(localPath)) {
    console.warn(".env.local already exists; nothing changed.");
    return;
  }
  const exampleText = readFileSync(examplePath, "utf8");
  const secrets = generatedSecrets(exampleText);
  // "wx" fails if the file appeared meanwhile; 0600 keeps the secrets private on macOS and Linux.
  writeFileSync(localPath, setEnvValues(exampleText, secrets), { flag: "wx", mode: 0o600 });
  console.warn(`Created .env.local with fresh values for: ${Object.keys(secrets).join(", ")}.`);
  console.warn(
    "It is gitignored. Keep CREDENTIALS_ENCRYPTION_KEY safe once real credentials are stored.",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
