"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (`/sw.js`) once, on the client, after mount.
 *
 * Registration runs from bundled app JS (not an inline <script>), so the strict nonce-based CSP
 * in `src/proxy.ts` is satisfied without any special handling. The worker is minimal: it enables
 * installability and an offline fallback only — it caches no application data (see `public/sw.js`).
 *
 * Only registers in production: in dev, `next dev` and HMR fight a service worker and it serves no
 * purpose there.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal: the app works without the worker, just not offline.
      });
    };

    // Defer to after load so the worker never competes with first paint / hydration.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
