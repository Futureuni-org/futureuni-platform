/**
 * Real PageSpeed Insights v5 call. Key from the credentials vault (`pagespeed`) or
 * `PAGESPEED_API_KEY`. Lab data only (CrUX field data is being dropped from this API).
 *
 * Endpoint: https://www.googleapis.com/pagespeedonline/v5/runPagespeed
 */

import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { resolveProviderKey } from "@/platform/credentials";

import { pagespeedReportUrl, type PageSpeedResult } from "./index";

const AuditValue = z.object({ numericValue: z.number().optional() }).optional();
const PsiResponse = z.object({
  lighthouseResult: z.object({
    categories: z.object({ performance: z.object({ score: z.number().nullable() }).optional() }).optional(),
    audits: z
      .object({
        "largest-contentful-paint": AuditValue,
        "cumulative-layout-shift": AuditValue,
        "interaction-to-next-paint": AuditValue,
        "total-blocking-time": AuditValue,
        "total-byte-weight": AuditValue,
      })
      .optional(),
  }),
});

const TIMEOUT_MS = 30_000;

export async function realPageSpeed(url: string, strategy: "mobile" | "desktop"): Promise<PageSpeedResult> {
  const key = await resolveProviderKey("pagespeed");
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("category", "performance");
  if (key !== null) endpoint.searchParams.set("key", key);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) {
      throw new AppError("PROVIDER_ERROR", `PageSpeed returned ${String(res.status)} for ${strategy}.`);
    }
    const parsed = PsiResponse.parse(await res.json());
    const audits = parsed.lighthouseResult.audits ?? {};
    const score = parsed.lighthouseResult.categories?.performance?.score ?? 0;
    return {
      strategy,
      performanceScore: Math.round(score * 100),
      lcpMs: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
      cls: Number((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
      inpMs: audits["interaction-to-next-paint"]?.numericValue ?? null,
      tbtMs: audits["total-blocking-time"]?.numericValue ?? null,
      totalBytes: Math.round(audits["total-byte-weight"]?.numericValue ?? 0),
      reportUrl: pagespeedReportUrl(url, strategy),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new AppError("PROVIDER_ERROR", aborted ? "PageSpeed timed out." : "PageSpeed request failed.");
  } finally {
    clearTimeout(timer);
  }
}
