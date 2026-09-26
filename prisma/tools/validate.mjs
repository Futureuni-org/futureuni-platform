#!/usr/bin/env node
// pnpm db:validate: the Prisma schema is valid, and replaying prisma/migrations produces exactly
// that schema (no drift). CI runs it, so a schema edit without its migration fails the build.
//
// The drift check needs an empty "shadow" database. SHADOW_DATABASE_URL is used when set;
// otherwise, on a local server only, a throwaway database is created and dropped afterwards.

import { randomBytes } from "node:crypto";

import {
  assertLocal,
  createDatabase,
  dropDatabase,
  localSettings,
  withClient,
  withDatabase,
} from "../../scripts/lib/local-db.mjs";
import { fail, prisma } from "./prisma-cli.mjs";

if (prisma(["validate"]) !== 0) process.exit(1);

const settings = localSettings();
let shadowUrl = settings.SHADOW_DATABASE_URL;
let dropShadow = async () => {};

if (shadowUrl === undefined) {
  const base = settings.DIRECT_URL ?? settings.DATABASE_URL;
  if (base === undefined) fail("Set DIRECT_URL (or SHADOW_DATABASE_URL) to check for drift.");
  assertLocal(base);
  const name = `futureuni_shadow_${randomBytes(4).toString("hex")}`;
  const admin = withDatabase(base, "postgres");
  await withClient(admin, (client) => createDatabase(client, name));
  shadowUrl = withDatabase(base, name);
  dropShadow = () => withClient(admin, (client) => dropDatabase(client, name));
}

let status;
try {
  // Exit codes: 0 = no difference, 2 = the migrations and the schema differ, 1 = error.
  status = prisma(
    [
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema",
      "prisma/schema",
      "--exit-code",
    ],
    { SHADOW_DATABASE_URL: shadowUrl },
  );
} finally {
  await dropShadow();
}

if (status === 2) {
  fail(
    "prisma/migrations doesn't match prisma/schema. Create a migration with pnpm db:migrate --name <what-it-does>.",
  );
}
if (status !== 0) process.exit(status);
console.warn("ok    the migrations match the schema");
