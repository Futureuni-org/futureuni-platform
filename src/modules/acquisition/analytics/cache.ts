/**
 * Caching for the analytics data layer (module spec §3.14: "cache results per filter set for 5
 * minutes … and invalidate on relevant events where cheap").
 *
 * The project does not enable Cache Components, so the `"use cache"` directive is unavailable; the
 * Next.js "previous model" `unstable_cache` is the documented way to cache non-fetch database reads
 * with a TTL and tags (`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`).
 * Only the pure aggregation functions are wrapped — they take primitive filter values and never a
 * session, so entries are shared across viewers and the permission check stays outside the cache.
 *
 * Invalidation is coarse (one tag for all analytics): `unstable_cache` tags are fixed at wrap time,
 * so per-line tags aren't possible here. The 5-minute TTL is the primary freshness mechanism;
 * `revalidateAnalytics()` clears everything on demand. A REQUESTS.md item asks integration to call
 * it from the relevant domain-event handlers, and to move to `"use cache"` if Phase 1 enables it.
 */

import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

export const ANALYTICS_CACHE_TAG = "acq-analytics";
export const ANALYTICS_CACHE_TTL_SECONDS = 300;

/**
 * Wraps a pure aggregation function so its result is cached for 5 minutes per argument set. The
 * arguments must be serialisable (they form the cache key); pass primitive filters, never an actor.
 */
export function cacheAnalytics<A extends unknown[], R>(
  keyParts: string[],
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  // `unstable_cache` needs Next's request-scoped incremental cache, which isn't present under
  // Vitest; tests call the raw aggregation directly (and measure uncached query speed).
  if (process.env.VITEST !== undefined) return fn;
  return unstable_cache(fn, ["acq-analytics", ...keyParts], {
    revalidate: ANALYTICS_CACHE_TTL_SECONDS,
    tags: [ANALYTICS_CACHE_TAG],
  });
}

/**
 * Clears every cached analytics result. Call after events that change the underlying data. The
 * second argument is the Next.js 16 cache-life profile for the purge; "max" revalidates fully.
 */
export function revalidateAnalytics(): void {
  revalidateTag(ANALYTICS_CACHE_TAG, "max");
}
