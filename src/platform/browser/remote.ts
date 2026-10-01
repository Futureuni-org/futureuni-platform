/**
 * The wire protocol shared by the two remote capture runtimes (`vercel-sandbox`, `serverless-
 * chromium`): the JSON a remote worker returns, and the HMAC signing used to authenticate the
 * `serverless-chromium` request to its separate, secret-free project.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { NormalizedCaptureRequest, RawCaptureResult } from "./types";

export const RemoteCaptureResultSchema = z.object({
  ok: z.boolean(),
  finalUrl: z.string(),
  screenshotBase64: z.string().optional(),
  screenshotContentType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  html: z.string().optional(),
  axeViolations: z
    .array(z.object({ id: z.string(), impact: z.string(), nodes: z.int().nonnegative(), help: z.string() }))
    .optional(),
  consoleErrors: z.array(z.string()).optional(),
  ogImages: z.array(z.string()).optional(),
  timings: z.object({ loadMs: z.int().nonnegative() }),
  blockedReason: z.enum(["robots", "ssrf", "timeout", "error"]).optional(),
});
export type RemoteCaptureResult = z.infer<typeof RemoteCaptureResultSchema>;

/** Turns a validated remote result into a `RawCaptureResult` (decoding the screenshot bytes). */
export function fromRemoteResult(remote: RemoteCaptureResult): RawCaptureResult {
  const result: RawCaptureResult = {
    ok: remote.ok,
    finalUrl: remote.finalUrl,
    timings: remote.timings,
  };
  if (remote.screenshotBase64 !== undefined) {
    result.screenshot = {
      bytes: new Uint8Array(Buffer.from(remote.screenshotBase64, "base64")),
      contentType: remote.screenshotContentType ?? "image/png",
    };
  }
  if (remote.html !== undefined) result.html = remote.html;
  if (remote.axeViolations !== undefined) result.axeViolations = remote.axeViolations;
  if (remote.consoleErrors !== undefined) result.consoleErrors = remote.consoleErrors;
  if (remote.ogImages !== undefined) result.ogImages = remote.ogImages;
  if (remote.blockedReason !== undefined) result.blockedReason = remote.blockedReason;
  return result;
}

/** The body the `serverless-chromium` worker receives. */
export function remoteRequestBody(req: NormalizedCaptureRequest): string {
  return JSON.stringify({
    url: req.url,
    viewport: req.viewport,
    fullPage: req.fullPage,
    waitFor: req.waitFor,
    actions: req.actions,
    collect: req.collect,
    timeoutMs: req.timeoutMs,
  });
}

/** HMAC-SHA256 of the raw body, hex — the `x-futureuni-signature` header value. */
export function signBody(body: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(body, "utf8").digest("hex");
}

/** Constant-time verification, for the separate worker project (exported for reuse and tests). */
export function verifySignature(body: string, signature: string, signingKey: string): boolean {
  const expected = signBody(body, signingKey);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}
