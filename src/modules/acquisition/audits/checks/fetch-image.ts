/**
 * Guarded binary image fetch for brand-surface and logo checks. `safeFetch` returns text only, so
 * this is the one place that reads image bytes — behind the same SSRF + robots guards, a size cap and
 * a hard timeout, and only for `image/*` responses.
 */

import "server-only";

import { guardUrl, isAllowedByRobots } from "@/platform/http";

const CRAWLER_UA = "FUTUREUNI-Bot/1.0";
const DEFAULT_MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;

export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
}

export async function fetchImageGuarded(url: string, maxBytes = DEFAULT_MAX_BYTES): Promise<FetchedImage | null> {
  const guard = await guardUrl(url);
  if (!guard.ok) return null;
  try {
    const allowed = await isAllowedByRobots(url, CRAWLER_UA);
    if (!allowed) return null;
  } catch {
    // robots-fetch failure is treated as allowed.
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    // Follow redirects manually, re-running the SSRF guard on every hop so a public → private
    // redirect can't reach an internal address (same posture as safeFetch).
    let currentUrl = url;
    for (let hop = 0; hop <= 3; hop += 1) {
      if (hop > 0) {
        const hopGuard = await guardUrl(currentUrl);
        if (!hopGuard.ok) return null;
      }
      const res = await fetch(currentUrl, { headers: { "user-agent": CRAWLER_UA }, signal: controller.signal, redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location === null) return null;
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      if (!contentType.startsWith("image/")) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null;
      return { bytes: buf, contentType: contentType.split(";")[0]?.trim() ?? contentType };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
