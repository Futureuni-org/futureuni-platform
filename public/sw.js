/*
 * FUTUREUNI PWA service worker (minimal, dependency-free).
 *
 * Purpose: make the app installable and give it a graceful offline fallback for navigations.
 * It deliberately does NOT cache application data (leads, pipeline, inbox, analytics) or API
 * responses — internal workers must never see stale business data. Only an offline fallback
 * page is precached.
 *
 * Bump CACHE_VERSION whenever the offline page changes so old caches are dropped on activate.
 */

const CACHE_VERSION = "futureuni-pwa-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // `reload` bypasses the HTTP cache so a redeploy always precaches the fresh offline page.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle top-level navigations. Everything else (scripts, styles, images, API, server
  // actions) goes straight to the network untouched — no data is cached.
  if (request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        // Network-first: always prefer the live app so content is never stale.
        return await fetch(request);
      } catch {
        // Offline (or the network failed): serve the precached fallback page.
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(OFFLINE_URL);
        return cached ?? Response.error();
      }
    })(),
  );
});
