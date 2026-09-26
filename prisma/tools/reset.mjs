#!/usr/bin/env node
// pnpm db:reset (development only): drops the local database, re-applies every migration,
// regenerates the client and runs the seed. Prisma 7's `migrate reset` no longer seeds, and it
// would reset any database it's pointed at, so this refuses anything but a local server.

import { assertLocal, localSettings } from "../../scripts/lib/local-db.mjs";
import { fail, prisma } from "./prisma-cli.mjs";

const settings = localSettings();
if (settings.NODE_ENV === "production") fail("db:reset never runs with NODE_ENV=production.");
const url = settings.DIRECT_URL;
if (url === undefined)
  fail("DIRECT_URL isn't set. Create .env.local with node scripts/env-init.mjs.");
assertLocal(url);

for (const args of [["migrate", "reset", "--force"], ["generate"], ["db", "seed"]]) {
  if (prisma(args) !== 0) fail(`prisma ${args.join(" ")} failed.`);
}
