#!/usr/bin/env node
// Generates the Prisma client only when it's missing or stale. The pre-scripts (predev,
// prebuild, pretypecheck, pretest) run this, so a fresh clone and every Vercel build get a client
// without a manual step, while repeated runs skip the ~6 s generate. `pnpm db:generate` always
// regenerates.
//
// Stale means: prisma/schema/*.prisma or the installed Prisma version changed since the stamp in
// src/generated/prisma/.schema-hash was written.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { REPO_ROOT } from "../../scripts/lib/env-file.mjs";
import { fail, prisma } from "./prisma-cli.mjs";

const schemaDir = join(REPO_ROOT, "prisma", "schema");
const outputDir = join(REPO_ROOT, "src", "generated", "prisma");
const stampFile = join(outputDir, ".schema-hash");

const hash = createHash("sha256");
const require = createRequire(import.meta.url);
hash.update(require("prisma/package.json").version);
hash.update(require("@prisma/client/package.json").version);
for (const file of readdirSync(schemaDir)
  .filter((name) => name.endsWith(".prisma"))
  .sort()) {
  hash.update(file).update(readFileSync(join(schemaDir, file)));
}
const digest = hash.digest("hex");

const current =
  existsSync(join(outputDir, "client.ts")) && existsSync(stampFile)
    ? readFileSync(stampFile, "utf8").trim()
    : null;

if (current !== digest) {
  if (prisma(["generate"]) !== 0) fail("prisma generate failed.");
  writeFileSync(stampFile, `${digest}\n`);
}
