import "server-only";

/**
 * Phase 7 seeder (module spec 3.2, M7-AC6). Discovered by the platform seed runner
 * (src slash-star-star slash seed.ts); runs at order 25, after Phase 2's initial
 * placeholder seed at 20.
 *
 * The actual logic lives in `./ensure-defaults.ts` so that `pnpm bootstrap:admin` can publish the
 * same defaults in production (the dev seed refuses to run against a production database).
 *
 * Idempotent by design: running twice ends in the same state.
 */

import { defineSeeder, type Tx } from "@/platform/db";

import { ensureDefaultProfiles } from "./ensure-defaults";

export default defineSeeder({
  name: "acquisition.profiles",
  order: 25,
  async run(tx: Tx, ctx) {
    await ensureDefaultProfiles(tx, ctx.log);
  },
});
