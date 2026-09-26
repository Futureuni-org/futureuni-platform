/**
 * What every Phase 2 seeder shares: the world for this run (built once), and the id map for rows
 * matched on a natural key. A seeded user, company, sending domain or mailbox may already exist
 * under another id (for example a user Phase 3 created with the same email); the seed then
 * updates that row and every reference to the seeded id is rewritten to the existing one.
 */

import type { Tx } from "@/platform/db";

import { buildWorld, type World } from "../world";

let cached: { at: number; world: World } | undefined;

/** The seed world for this run's `now` (built once per run, shared by every seeder). */
export function seedWorld(now: Date): World {
  if (cached?.at !== now.getTime()) cached = { at: now.getTime(), world: buildWorld(now) };
  return cached.world;
}

export type IdMap = ReadonlyMap<string, string>;

/** Seed id → existing id, for rows matched on their natural key under another id. */
export async function loadIdMap(tx: Tx, world: World): Promise<IdMap> {
  const map = new Map<string, string>();
  const match = (
    seedRows: readonly { id: string; key: string }[],
    existing: readonly { id: string; key: string | null }[],
  ) => {
    for (const row of existing) {
      const seeded = seedRows.find(
        (candidate) => candidate.key.toLowerCase() === row.key?.toLowerCase(),
      );
      if (seeded !== undefined && seeded.id !== row.id) map.set(seeded.id, row.id);
    }
  };
  const users = world.platform.users.map((user) => ({ id: user.id, key: user.email }));
  match(
    users,
    (
      await tx.user.findMany({
        where: { email: { in: users.map((user) => user.key) } },
        select: { id: true, email: true },
      })
    ).map((row) => ({ id: row.id, key: row.email })),
  );

  const companies = world.directory.companies.flatMap((company) =>
    company.normalizedDomain == null ? [] : [{ id: company.id, key: company.normalizedDomain }],
  );
  match(
    companies,
    (
      await tx.company.findMany({
        where: { normalizedDomain: { in: companies.map((company) => company.key) } },
        select: { id: true, normalizedDomain: true },
      })
    ).map((row) => ({ id: row.id, key: row.normalizedDomain })),
  );

  const domains = world.outreach.sendingDomains.map((domain) => ({
    id: domain.id,
    key: domain.domain,
  }));
  match(
    domains,
    (
      await tx.sendingDomain.findMany({
        where: { domain: { in: domains.map((domain) => domain.key) } },
        select: { id: true, domain: true },
      })
    ).map((row) => ({ id: row.id, key: row.domain })),
  );

  const mailboxes = world.outreach.mailboxes.map((mailbox) => ({
    id: mailbox.id,
    key: mailbox.address,
  }));
  match(
    mailboxes,
    (
      await tx.mailbox.findMany({
        where: { address: { in: mailboxes.map((mailbox) => mailbox.key) } },
        select: { id: true, address: true },
      })
    ).map((row) => ({ id: row.id, key: row.address })),
  );
  return map;
}

/** Rewrites every seeded id in `value` (deeply, JSON included) that maps to an existing row. */
export function remap<T>(value: T, ids: IdMap): T {
  if (ids.size === 0) return value;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return ids.get(node) ?? node;
    if (Array.isArray(node)) return node.map(walk);
    if (
      node === null ||
      typeof node !== "object" ||
      Object.getPrototypeOf(node) !== Object.prototype
    )
      return node;
    return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
  };
  return walk(value) as T;
}

/** A copy of `row` without `keys` (the update half of an upsert on a natural key). */
export function without<T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> {
  const drop = new Set<PropertyKey>(keys);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !drop.has(key))) as Omit<T, K>;
}

/**
 * Upserts rows by id, in order (writes in one transaction must not run concurrently): creates a
 * missing row, or resets an existing one to its seeded values.
 */
export async function upsertRows<T extends { id: string }>(
  rows: readonly T[],
  ids: IdMap,
  write: (args: { where: { id: string }; create: T; update: Omit<T, "id"> }) => Promise<unknown>,
): Promise<number> {
  for (const row of rows) {
    const mapped = remap(row, ids);
    const { id, ...update } = mapped;
    await write({ where: { id }, create: mapped, update });
  }
  return rows.length;
}
