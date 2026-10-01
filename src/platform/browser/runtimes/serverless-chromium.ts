/**
 * `serverless-chromium` runtime (ADR-017 fallback): posts the normalized capture request to a
 * separate, secret-free Vercel project that runs `@sparticuz/chromium` + `playwright-core` (the
 * `worker-source.ts` runner). The request is HMAC-signed so the worker project can authenticate it
 * without sharing this app's secrets.
 */

import "server-only";

import { env } from "@/env";
import { AppError } from "@/lib/errors";

import { fromRemoteResult, RemoteCaptureResultSchema, remoteRequestBody, signBody } from "../remote";
import type { BrowserRuntime, NormalizedCaptureRequest, RawCaptureResult } from "../types";

export const serverlessChromiumRuntime: BrowserRuntime = {
  id: "serverless-chromium",
  async capture(req: NormalizedCaptureRequest): Promise<RawCaptureResult> {
    if (env.BROWSER_FALLBACK_URL === undefined || env.BROWSER_FALLBACK_SIGNING_KEY === undefined) {
      throw new AppError(
        "PROVIDER_ERROR",
        "serverless-chromium runtime needs BROWSER_FALLBACK_URL and BROWSER_FALLBACK_SIGNING_KEY.",
      );
    }
    const body = remoteRequestBody(req);
    const signature = signBody(body, env.BROWSER_FALLBACK_SIGNING_KEY);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, req.timeoutMs + 5_000);
    try {
      const res = await fetch(env.BROWSER_FALLBACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-futureuni-signature": signature },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ok: false, finalUrl: req.url, timings: { loadMs: 0 }, blockedReason: "error" };
      }
      const json = (await res.json()) as unknown;
      return fromRemoteResult(RemoteCaptureResultSchema.parse(json));
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        finalUrl: req.url,
        timings: { loadMs: 0 },
        blockedReason: aborted ? "timeout" : "error",
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
