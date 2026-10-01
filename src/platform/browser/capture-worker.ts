/**
 * The Playwright capture logic shared by the `local-playwright` runtime and the Vercel-Sandbox
 * worker. It runs inside ONE freshly created browser context, closed afterwards. It only navigates
 * (by visible text) and scrolls — it never types, submits forms, logs in, or accepts cookie banners
 * (ADR-017 / `docs/contracts/audit-agent.md` §4 rule 8).
 *
 * Playwright and `@axe-core/playwright` are imported for types only; runtimes pass a live `Browser`
 * so this module never forces those packages into a bundle that shouldn't have them.
 */

import "server-only";

import type { Browser, ConsoleMessage, Page } from "playwright-core";

import { assertActionsAreNavigationOnly } from "./safety";
import {
  VIEWPORTS,
  type AxeViolation,
  type NormalizedCaptureRequest,
  type RawCaptureResult,
} from "./types";

/**
 * Runs one capture with the given (already launched) browser. The screenshot is returned as PNG
 * bytes; the caller converts and stores it. Every collection step is independent: a failure in one
 * degrades the result rather than throwing.
 */
export async function runPlaywrightCapture(
  browser: Browser,
  req: NormalizedCaptureRequest,
): Promise<RawCaptureResult> {
  assertActionsAreNavigationOnly(req.actions);

  const vp = VIEWPORTS[req.viewport];
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    serviceWorkers: "block",
  });
  const consoleErrors: string[] = [];
  const start = Date.now();
  try {
    const page = await context.newPage();
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("pageerror", (err: Error) => {
      consoleErrors.push(err.message.slice(0, 300));
    });

    const response = await page.goto(req.url, {
      waitUntil: req.waitFor === "networkidle" ? "networkidle" : "load",
      timeout: req.timeoutMs,
    });

    // Navigation-only actions: click a link/button by visible text, or scroll.
    for (const action of req.actions) {
      try {
        if (action.type === "scroll") {
          await page.mouse.wheel(0, action.px);
          await page.waitForTimeout(300);
        } else {
          const target = page
            .getByRole("link", { name: action.text, exact: false })
            .or(page.getByRole("button", { name: action.text, exact: false }))
            .first();
          await target.click({ timeout: 5_000 });
          await page.waitForLoadState("load", { timeout: req.timeoutMs }).catch(() => undefined);
        }
      } catch {
        // A missing link/button is a navigation dead-end, not a capture failure.
      }
    }

    const loadMs = Date.now() - start;
    const finalUrl = page.url();

    const screenshotBuffer = await page.screenshot({ fullPage: req.fullPage, type: "png" });

    const result: RawCaptureResult = {
      ok: response === null ? true : response.ok(),
      finalUrl,
      screenshot: { bytes: new Uint8Array(screenshotBuffer), contentType: "image/png" },
      timings: { loadMs },
    };

    if (req.collect.html === true) {
      const html = await page.content().catch(() => undefined);
      if (html !== undefined) result.html = html;
    }
    if (req.collect.ogImages === true) {
      result.ogImages = await page
        .$$eval('meta[property="og:image"], meta[name="og:image"]', (nodes) =>
          nodes
            .map((n) => (n as HTMLMetaElement).content)
            .filter((c): c is string => typeof c === "string" && c.length > 0),
        )
        .catch(() => []);
    }
    if (req.collect.consoleErrors === true) {
      result.consoleErrors = consoleErrors;
    }
    if (req.collect.axe === true) {
      result.axeViolations = await runAxe(page).catch(() => [] as AxeViolation[]);
    }
    return result;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Runs axe-core on the page and maps violations to the capture shape. */
async function runAxe(page: Page): Promise<AxeViolation[]> {
  const mod = await import("@axe-core/playwright");
  const AxeBuilder = mod.default;
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? "unknown",
    nodes: v.nodes.length,
    help: v.help.slice(0, 200),
  }));
}
