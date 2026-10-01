/**
 * PageSpeed Insights provider (API v5, provider id `pagespeed`). Returns lab metrics for a URL on a
 * form factor. `mock` is used under `MOCKS=true`; the real adapter calls the PSI API with the key
 * from the credentials vault or `PAGESPEED_API_KEY`.
 *
 * Docs: https://developers.google.com/speed/docs/insights/v5/get-started
 */

import "server-only";

import { env } from "@/env";

export interface PageSpeedResult {
  strategy: "mobile" | "desktop";
  performanceScore: number; // 0–100
  lcpMs: number;
  cls: number;
  inpMs: number | null;
  tbtMs: number | null;
  totalBytes: number;
  reportUrl: string;
  fetchedAt: string;
}

export function pagespeedReportUrl(url: string, strategy: "mobile" | "desktop"): string {
  return `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`;
}

export async function runPageSpeed(url: string, strategy: "mobile" | "desktop"): Promise<PageSpeedResult> {
  if (env.MOCKS) {
    const { mockPageSpeed } = await import("./mock");
    return mockPageSpeed(url, strategy);
  }
  const { realPageSpeed } = await import("./real");
  return realPageSpeed(url, strategy);
}
