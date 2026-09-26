import type { Faker } from "@faker-js/faker";

import type { Tx } from "./transaction";

/**
 * What every seeder receives. `now` is fixed for the whole run, so relative timestamps ("sent 3
 * days ago") are consistent across seeders; `faker` is seeded (20260925) for secondary text only.
 */
export interface SeedContext {
  now: Date;
  faker: Faker;
  log: (message: string) => void;
}

/**
 * A development seeder. The runner (prisma/seed/index.ts) discovers `prisma/seed/seeders/*.ts`
 * and every `src/** /seed.ts`, runs them in ascending `order`, each in its own transaction, and
 * only against a local database.
 *
 * Phase 2's seeders use orders 10–100 (users 10, profiles 20, directory 30, leads 40, audits 50,
 * outreach 60, inbox 70, compliance 80, pipeline 90, platform 100). A later seeder picks an order
 * after the rows it needs, for example Phase 3's credentials after the users.
 *
 * Seeders must be idempotent: running `pnpm db:seed` twice leaves the same rows.
 */
export interface Seeder {
  name: string;
  order: number;
  run: (tx: Tx, ctx: SeedContext) => Promise<void>;
}

/** Declares a seeder (the default export of a seed file). */
export function defineSeeder(seeder: Seeder): Seeder {
  if (!Number.isInteger(seeder.order) || seeder.order < 0) {
    throw new Error(`Seeder "${seeder.name}" needs a non-negative integer order.`);
  }
  return seeder;
}
