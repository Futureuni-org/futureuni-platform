/**
 * Internal types for the browser runtime (`@/platform/browser`, ADR-017).
 *
 * The public capture contract (`CaptureRequest`, `CaptureResult`, `BrowserRuntimeId`, `Capture`)
 * lives in `@/contracts/audit-agent`. A `BrowserRuntime` produces raw screenshot bytes and
 * collected data; the public `capture()` orchestrator stores the screenshot (as WebP) through
 * `@/platform/storage` and returns a `CaptureResult`.
 */

import "server-only";

import type { CaptureRequest, CaptureResult } from "@/contracts/audit-agent";

/** A screenshot as produced by a runtime, before it is stored. */
export interface RawScreenshot {
  bytes: Uint8Array;
  /** WebP is stored as-is; PNG/JPEG are converted to WebP before storage. */
  contentType: "image/png" | "image/jpeg" | "image/webp";
}

/** One axe-core violation, mirroring `CaptureResult["axeViolations"]`. */
export interface AxeViolation {
  id: string;
  impact: string;
  nodes: number;
  help: string;
}

/**
 * What a runtime returns. `capture()` adds `screenshotKey` (after storing the screenshot) and
 * strips the raw bytes before handing back a `CaptureResult`.
 */
export interface RawCaptureResult {
  ok: boolean;
  finalUrl: string;
  screenshot?: RawScreenshot;
  html?: string;
  axeViolations?: AxeViolation[];
  consoleErrors?: string[];
  ogImages?: string[];
  timings: { loadMs: number };
  blockedReason?: CaptureResult["blockedReason"];
}

/** A capture request with every default applied. */
export interface NormalizedCaptureRequest {
  url: string;
  viewport: "mobile" | "desktop";
  fullPage: boolean;
  waitFor: "load" | "networkidle";
  actions: NonNullable<CaptureRequest["actions"]>;
  collect: NonNullable<CaptureRequest["collect"]>;
  /** Hard per-capture timeout (ms). ADR-017 / contract: 20s. */
  timeoutMs: number;
}

/** Viewport geometry. mobile = 390x844 @2x, desktop = 1440x900 @1x. */
export const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
} as const;

/** A browser runtime implementation (ADR-017). */
export interface BrowserRuntime {
  id: "vercel-sandbox" | "serverless-chromium" | "local-playwright" | "mock";
  capture(req: NormalizedCaptureRequest): Promise<RawCaptureResult>;
}

/** The hard timeout every capture is bounded by (contract §"Browser runtime"). */
export const CAPTURE_HARD_TIMEOUT_MS = 20_000;

/** The user agent every fetch and capture identifies as (INV-14). */
export const CRAWLER_USER_AGENT = "FUTUREUNI-Bot/1.0";
