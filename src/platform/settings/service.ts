/**
 * Typed settings store (Phase 6, `platform.md` §3.8).
 *
 * - `getSetting(key, { userId? })` returns the typed value or its registered default.
 * - `setSetting(actor, key, value)` validates, checks permission, audits and emits
 *   `settings.changed`.
 * - Per-request caching is available through `withSettingsRequest(fn)`; it invalidates on write
 *   within the same request.
 *
 * SEAM-SETTINGS-AI wires into `getSetting`.
 */

import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { Actor } from "@/contracts/common";
import type { SettingDefinition } from "@/contracts/module-manifest";
import { AppError } from "@/lib/errors";
import { audit } from "@/platform/audit-log";
import { db, toJsonInput } from "@/platform/db";
import { publish } from "@/platform/events";
import { getSettingDefinitions } from "@/platform/registry";
import { assertActorCan } from "@/platform/auth";

import { PLATFORM_SETTINGS } from "./definitions";

// ---- Registry --------------------------------------------------------------

let byKey: Map<string, SettingDefinition> | null = null;

function definitions(): Map<string, SettingDefinition> {
  if (byKey === null) {
    // Merge registry-registered settings (from module manifests) with the platform defaults.
    // Platform defaults win when a manifest hasn't registered its own copy yet.
    const merged = new Map<string, SettingDefinition>();
    for (const def of getSettingDefinitions()) merged.set(def.key, def);
    for (const def of PLATFORM_SETTINGS) if (!merged.has(def.key)) merged.set(def.key, def);
    byKey = merged;
  }
  return byKey;
}

/** Reset the cache; only used by tests. */
export function _resetSettingsRegistry(): void {
  byKey = null;
}

function requireDefinition(key: string): SettingDefinition {
  const def = definitions().get(key);
  if (def === undefined) throw new AppError("NOT_FOUND", `Unknown setting: ${key}`);
  return def;
}

// ---- Per-request cache -----------------------------------------------------

type Cache = Map<string, unknown>;
const cacheStore = new AsyncLocalStorage<Cache>();

/** Run `fn` with a per-request settings cache. Writes clear it. */
export async function withSettingsRequest<T>(fn: () => Promise<T>): Promise<T> {
  return cacheStore.run(new Map(), fn);
}

// ---- Read ------------------------------------------------------------------

export async function getSetting<T = unknown>(
  key: string,
  opts: { userId?: string } = {},
): Promise<T> {
  const def = requireDefinition(key);
  const cache = cacheStore.getStore();
  const cacheKey =
    def.scope === "USER" && opts.userId !== undefined ? `${key}:${opts.userId}` : key;
  if (cache?.has(cacheKey) === true) return cache.get(cacheKey) as T;

  const row = await db.setting.findFirst({
    where:
      def.scope === "USER"
        ? { key, scope: "USER", userId: opts.userId ?? "__none__" }
        : { key, scope: def.scope, userId: null },
    select: { value: true },
  });
  const value = row === null ? (def.default as T) : (row.value as T);
  if (cache !== undefined) cache.set(cacheKey, value);
  return value;
}

// ---- Write ----------------------------------------------------------------

export async function setSetting(
  actor: Actor,
  key: string,
  rawValue: unknown,
  opts: { userId?: string } = {},
): Promise<void> {
  const def = requireDefinition(key);
  const parsed = def.schema.safeParse(rawValue);
  if (!parsed.success) {
    const details = parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.path.join(".") || "(value)"] = issue.message;
      return acc;
    }, {});
    throw new AppError("VALIDATION_FAILED", `Invalid value for setting "${key}".`, { details });
  }
  // User-scope: only the target user (or the SELF actor themselves).
  const userId =
    def.scope === "USER"
      ? (opts.userId ?? (actor.type === "USER" ? actor.userId : undefined))
      : undefined;
  if (def.scope === "USER" && userId === undefined) {
    throw new AppError("VALIDATION_FAILED", "User-scope settings need a userId.");
  }
  await assertActorCan(actor, def.requiredPermission, def.scope === "USER" ? { userId } : {});

  const updatedById = actor.type === "USER" ? actor.userId : null;
  const before = await db.setting.findFirst({
    where:
      def.scope === "USER"
        ? { key, scope: "USER", userId: userId ?? "__none__" }
        : { key, scope: def.scope, userId: null },
    select: { value: true },
  });

  if (def.scope === "USER") {
    if (userId === undefined)
      throw new AppError("VALIDATION_FAILED", "User-scope settings need a userId.");
    // Prisma can't upsert through the partial unique index on (key, scope, userId) — it is
    // `WHERE userId IS NOT NULL`, which Postgres won't use for ON CONFLICT — so find-then-write,
    // exactly as the PLATFORM/MODULE branch below does.
    const existing = await db.setting.findFirst({
      where: { key, scope: "USER", userId },
      select: { id: true },
    });
    if (existing === null) {
      await db.setting.create({
        data: { key, scope: "USER", userId, value: toJsonInput(parsed.data), updatedById },
      });
    } else {
      await db.setting.update({
        where: { id: existing.id },
        data: { value: toJsonInput(parsed.data), updatedById },
      });
    }
  } else {
    // For PLATFORM/MODULE scope, `userId` is null. Since Prisma can't upsert through a partial
    // unique index (project-rules §Stack), find-then-write.
    const existing = await db.setting.findFirst({
      where: { key, scope: def.scope, userId: null },
      select: { id: true },
    });
    if (existing === null) {
      await db.setting.create({
        data: {
          key,
          scope: def.scope,
          module: def.scope === "MODULE" ? (key.split(".")[0] ?? null) : null,
          value: toJsonInput(parsed.data),
          updatedById,
        },
      });
    } else {
      await db.setting.update({
        where: { id: existing.id },
        data: { value: toJsonInput(parsed.data), updatedById },
      });
    }
  }

  cacheStore
    .getStore()
    ?.delete(def.scope === "USER" && userId !== undefined ? `${key}:${userId}` : key);

  await audit.record(null, {
    actor,
    action: "platform.setting.update",
    targetType: "Setting",
    targetId: key,
    before: before === null ? null : { value: before.value },
    after: { value: parsed.data },
  });

  await publish({
    name: "settings.changed",
    actor,
    payload: { key, scope: def.scope, userId: userId ?? null },
  });
}

// ---- List ------------------------------------------------------------------

export interface SettingListItem {
  key: string;
  scope: "PLATFORM" | "MODULE" | "USER";
  module: string | null;
  label: string;
  description: string;
  requiredPermission: string;
  value: unknown;
  isDefault: boolean;
}

export async function listSettings(
  opts: {
    scope?: "PLATFORM" | "MODULE" | "USER";
    module?: string;
    userId?: string;
  } = {},
): Promise<SettingListItem[]> {
  const defs = [...definitions().values()].filter((d) => {
    if (opts.scope !== undefined && d.scope !== opts.scope) return false;
    if (opts.module !== undefined && !d.key.startsWith(`${opts.module}.`)) return false;
    return true;
  });
  const results: SettingListItem[] = [];
  for (const def of defs) {
    const row = await db.setting.findFirst({
      where:
        def.scope === "USER"
          ? { key: def.key, scope: "USER", userId: opts.userId ?? "__none__" }
          : { key: def.key, scope: def.scope, userId: null },
      select: { value: true, module: true },
    });
    results.push({
      key: def.key,
      scope: def.scope,
      module: row?.module ?? (def.scope === "MODULE" ? (def.key.split(".")[0] ?? null) : null),
      label: def.label,
      description: def.description,
      requiredPermission: def.requiredPermission,
      value: row === null ? def.default : row.value,
      isDefault: row === null,
    });
  }
  return results;
}
