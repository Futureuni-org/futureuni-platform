/**
 * @/platform/browser: the headless-browser capture runtime (ADR-017).
 *
 * `capture` is the single entry point (safety-gated, runtime-selected by `BROWSER_RUNTIME`, screenshots
 * stored privately as WebP). The public capture types live in `@/contracts/audit-agent`.
 */

import "server-only";

export { capture } from "./capture";
export { UnsafeActionError, assertActionsAreNavigationOnly, guardCaptureUrl } from "./safety";
export { storeScreenshot, toWebp } from "./screenshot-store";
export type { BrowserRuntime, RawCaptureResult, NormalizedCaptureRequest } from "./types";
export type {
  Capture,
  CaptureRequest,
  CaptureResult,
  BrowserRuntimeId,
} from "@/contracts/audit-agent";
