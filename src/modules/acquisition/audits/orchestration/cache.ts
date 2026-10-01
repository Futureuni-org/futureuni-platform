/**
 * The AuditContext cache, backed by `AuditCacheEntry`. Keys are `<scope>:<checkId>` (the scope is a
 * normalized domain, or a channel/app id for non-web checks). A miss returns null.
 */

import "server-only";

import type { Clock } from "@/contracts/common";

import { getCacheEntry, setCacheEntry } from "../audit.repo";

export interface AuditCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export function createAuditCache(clock: Clock): AuditCache {
  return {
    async get(key: string): Promise<unknown> {
      return getCacheEntry(key, clock.now());
    },
    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      const now = clock.now();
      const lastColon = key.lastIndexOf(":");
      const domain = lastColon === -1 ? key : key.slice(0, lastColon);
      const checkId = lastColon === -1 ? key : key.slice(lastColon + 1);
      await setCacheEntry({
        cacheKey: key,
        domain,
        checkId,
        result: value,
        capturedAt: now,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      });
    },
  };
}
