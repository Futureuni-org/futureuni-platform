/**
 * `local-playwright` runtime: launches the locally installed Chromium and runs the shared capture
 * worker. For development and the optional live proof only — never used in CI (tests use `mock`).
 * Playwright is imported lazily so it stays out of the production app bundle.
 */

import "server-only";

import { env } from "@/env";

import { runPlaywrightCapture } from "../capture-worker";
import type { BrowserRuntime, NormalizedCaptureRequest, RawCaptureResult } from "../types";

export const localPlaywrightRuntime: BrowserRuntime = {
  id: "local-playwright",
  async capture(req: NormalizedCaptureRequest): Promise<RawCaptureResult> {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      headless: true,
      // Use an explicit Chromium if given, else fall back to the installed Edge channel on Windows.
      ...(env.CHROMIUM_EXECUTABLE_PATH === undefined
        ? { channel: "msedge" }
        : { executablePath: env.CHROMIUM_EXECUTABLE_PATH }),
    });
    try {
      return await runPlaywrightCapture(browser, req);
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
};
