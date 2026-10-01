/**
 * Deterministic PageSpeed mock. Derives plausible-but-varied metrics from the URL so both markets
 * and good/poor sites are represented without a network call. A URL containing "slow" is always
 * poor; "fast" is always good.
 */

import "server-only";

import { pagespeedReportUrl, type PageSpeedResult } from "./index";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function mockPageSpeed(url: string, strategy: "mobile" | "desktop"): PageSpeedResult {
  const h = hash(`${url}:${strategy}`);
  const forcedSlow = url.includes("slow");
  const forcedFast = url.includes("fast");
  const base = forcedSlow ? 28 : forcedFast ? 92 : 35 + (h % 55); // 35–89
  const score = strategy === "mobile" ? base : Math.min(100, base + 8);
  const lcpMs = forcedSlow ? 7200 : forcedFast ? 1800 : 2200 + (h % 5000);
  return {
    strategy,
    performanceScore: score,
    lcpMs: strategy === "mobile" ? lcpMs : Math.round(lcpMs * 0.7),
    cls: Number((((h % 40) / 100)).toFixed(2)),
    inpMs: 120 + (h % 400),
    tbtMs: 150 + (h % 600),
    totalBytes: 1_200_000 + (h % 5_000_000),
    reportUrl: pagespeedReportUrl(url, strategy),
    fetchedAt: new Date().toISOString(),
  };
}
