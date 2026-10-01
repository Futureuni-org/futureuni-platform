import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/platform/db";

import { createAuditCache } from "./cache";

const keys: string[] = [];

afterEach(async () => {
  if (keys.length > 0) {
    await db.auditCacheEntry.deleteMany({ where: { cacheKey: { in: keys } } });
    keys.length = 0;
  }
});

describe("createAuditCache (domain-level reuse within the TTL)", () => {
  it("stores and returns a value within the TTL", async () => {
    const key = `cachetest-${randomUUID()}:web.pagespeed_mobile`;
    keys.push(key);
    const cache = createAuditCache({ now: () => new Date() });
    await cache.set(key, { performanceScore: 34, lcpSeconds: 7.2 }, 7 * 24 * 60 * 60);
    expect(await cache.get(key)).toEqual({ performanceScore: 34, lcpSeconds: 7.2 });
  });

  it("returns null once the entry has expired", async () => {
    const key = `cachetest-${randomUUID()}:web.pagespeed_mobile`;
    keys.push(key);
    await createAuditCache({ now: () => new Date() }).set(key, { x: 1 }, 60);
    const future = createAuditCache({ now: () => new Date(Date.now() + 120_000) });
    expect(await future.get(key)).toBeNull();
  });

  it("writes a row keyed by domain and check id (reusable across leads)", async () => {
    const key = `cachetest-${randomUUID()}:web.pagespeed_mobile`;
    keys.push(key);
    await createAuditCache({ now: () => new Date() }).set(key, { a: 1 }, 3_600);
    const row = await db.auditCacheEntry.findUnique({ where: { cacheKey: key } });
    expect(row?.checkId).toBe("web.pagespeed_mobile");
  });
});
