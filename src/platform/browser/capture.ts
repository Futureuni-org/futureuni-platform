/**
 * `capture()` — the single entry point for headless-browser captures (`@/platform/browser`,
 * ADR-017). It enforces safety, selects the runtime from `BROWSER_RUNTIME`, bounds the whole capture
 * with a hard timeout, and stores the screenshot privately as WebP with a retention window.
 *
 * The public shape is `Capture` from `@/contracts/audit-agent`.
 */

import "server-only";

import type { Capture, CaptureRequest, CaptureResult, BrowserRuntimeId } from "@/contracts/audit-agent";
import { env } from "@/env";

import { assertActionsAreNavigationOnly, guardCaptureUrl } from "./safety";
import { storeScreenshot } from "./screenshot-store";
import {
  CAPTURE_HARD_TIMEOUT_MS,
  type BrowserRuntime,
  type NormalizedCaptureRequest,
  type RawCaptureResult,
} from "./types";

const DEFAULT_SCREENSHOT_RETENTION_DAYS = 90;

function normalize(req: CaptureRequest): NormalizedCaptureRequest {
  return {
    url: req.url,
    viewport: req.viewport,
    fullPage: req.fullPage ?? false,
    waitFor: req.waitFor ?? "load",
    actions: req.actions ?? [],
    collect: req.collect ?? {},
    timeoutMs: CAPTURE_HARD_TIMEOUT_MS,
  };
}

async function selectRuntime(id: BrowserRuntimeId): Promise<BrowserRuntime> {
  switch (id) {
    case "mock":
      return (await import("./runtimes/mock")).mockRuntime;
    case "local-playwright":
      return (await import("./runtimes/local-playwright")).localPlaywrightRuntime;
    case "vercel-sandbox":
      return (await import("./runtimes/vercel-sandbox")).vercelSandboxRuntime;
    case "serverless-chromium":
      return (await import("./runtimes/serverless-chromium")).serverlessChromiumRuntime;
  }
}

/** Reads the screenshot retention window from settings, defaulting to 90 days if unregistered. */
async function screenshotRetentionDays(): Promise<number> {
  try {
    const { getSetting } = await import("@/platform/settings");
    const days = await getSetting<number>("platform.retention.screenshotsDays");
    if (typeof days === "number" && Number.isFinite(days) && days > 0) return days;
  } catch {
    // Setting not registered in this bundle context — use the contract default.
  }
  return DEFAULT_SCREENSHOT_RETENTION_DAYS;
}

async function withHardTimeout(
  runtime: BrowserRuntime,
  req: NormalizedCaptureRequest,
): Promise<RawCaptureResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RawCaptureResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, finalUrl: req.url, timings: { loadMs: req.timeoutMs }, blockedReason: "timeout" });
    }, req.timeoutMs + 3_000);
  });
  try {
    return await Promise.race([runtime.capture(req), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Captures a page. Throws `UnsafeActionError` only for a caller bug (a non-navigation action); every
 * runtime/network failure resolves to a `CaptureResult` with `ok: false` and a `blockedReason`, so a
 * check never crashes an audit.
 */
export const capture: Capture = async (req: CaptureRequest): Promise<CaptureResult> => {
  const normalized = normalize(req);
  // Safety: navigation-only actions, then SSRF + robots before any browser work (rule 8).
  assertActionsAreNavigationOnly(normalized.actions);
  const guard = await guardCaptureUrl(normalized.url);
  if (!guard.allowed) {
    return { ok: false, finalUrl: normalized.url, timings: { loadMs: 0 }, blockedReason: guard.reason };
  }

  const runtimeId = env.BROWSER_RUNTIME;
  const runtime = await selectRuntime(runtimeId);
  const raw = await withHardTimeout(runtime, normalized);

  const result: CaptureResult = {
    ok: raw.ok,
    finalUrl: raw.finalUrl,
    timings: raw.timings,
  };
  if (raw.html !== undefined) result.html = raw.html;
  if (raw.axeViolations !== undefined) result.axeViolations = raw.axeViolations;
  if (raw.consoleErrors !== undefined) result.consoleErrors = raw.consoleErrors;
  if (raw.ogImages !== undefined) result.ogImages = raw.ogImages;
  if (raw.blockedReason !== undefined) result.blockedReason = raw.blockedReason;

  if (raw.screenshot !== undefined) {
    try {
      result.screenshotKey = await storeScreenshot(raw.screenshot, {
        retentionDays: await screenshotRetentionDays(),
        module: "acquisition",
      });
    } catch {
      // Storing the screenshot failed; keep the measured data rather than failing the capture.
    }
  }
  return result;
};
