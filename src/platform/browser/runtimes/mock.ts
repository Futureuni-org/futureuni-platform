/**
 * `mock` browser runtime: returns a deterministic fixture screenshot and collected data. Used in
 * tests and with `MOCKS=true`, so the platform captures end to end with no real browser.
 *
 * The screenshot is a tiny valid WebP embedded as base64 (no binary fixture file, no `sharp` call),
 * so unit tests stay fast and deterministic. Collected data is derived from the request so callers
 * exercise real code paths (og images, axe counts, console errors, html).
 */

import "server-only";

import type { BrowserRuntime, NormalizedCaptureRequest, RawCaptureResult } from "../types";

/** A 32×32 solid violet WebP. */
const FIXTURE_WEBP_BASE64 =
  "UklGRkAAAABXRUJQVlA4IDQAAAAQAwCdASogACAAPrVUpE0nJKOiKAgA4BaJZQDJEBhwXgAA/upl//8Q5/W3/cprGL7uCAAA";

function fixtureScreenshotBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(FIXTURE_WEBP_BASE64, "base64"));
}

function mockHtml(url: string): string {
  const og = new URL("/og.png", url).toString();
  return [
    '<!doctype html><html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Example Business</title>",
    '<meta name="description" content="We build things.">',
    `<meta property="og:image" content="${og}">`,
    '</head><body><h1>Welcome</h1><a href="/contact">Contact</a></body></html>',
  ].join("");
}

export const mockRuntime: BrowserRuntime = {
  id: "mock",
  capture(req: NormalizedCaptureRequest): Promise<RawCaptureResult> {
    const result: RawCaptureResult = {
      ok: true,
      finalUrl: req.url,
      screenshot: { bytes: fixtureScreenshotBytes(), contentType: "image/webp" },
      timings: { loadMs: 420 },
      ...(req.collect.html === true ? { html: mockHtml(req.url) } : {}),
      ...(req.collect.axe === true
        ? { axeViolations: [{ id: "image-alt", impact: "serious", nodes: 2, help: "Images must have alternate text" }] }
        : {}),
      ...(req.collect.consoleErrors === true ? { consoleErrors: [] } : {}),
      ...(req.collect.ogImages === true ? { ogImages: [new URL("/og.png", req.url).toString()] } : {}),
    };
    return Promise.resolve(result);
  },
};
