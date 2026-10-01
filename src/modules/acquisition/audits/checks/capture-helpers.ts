/**
 * Shared helpers that several checks reuse: a cost-metered, domain-cached page capture, and a
 * domain-cached homepage fetch. Caching means two leads for the same company (or two checks for the
 * same lead) don't re-capture or re-fetch within the TTL.
 */

import "server-only";

import type { AuditCompanyInput, AuditContext, CaptureRequest, CaptureResult } from "@/contracts/audit-agent";
import type { SafeFetchResult } from "@/contracts/enrichment";

import { COST_MICROS } from "./cost";

const CAPTURE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function companyScopeKey(company: AuditCompanyInput): string {
  return company.normalizedDomain ?? company.id;
}

/**
 * Captures a page (mobile/desktop), charging the capture cost once and caching the result by domain.
 * Returns null when the per-lead cost cap is reached before an uncached capture.
 */
export async function getCapture(
  ctx: AuditContext,
  company: AuditCompanyInput,
  url: string,
  viewport: "mobile" | "desktop",
  opts: { fullPage?: boolean; collect?: CaptureRequest["collect"]; actions?: CaptureRequest["actions"] } = {},
): Promise<CaptureResult | null> {
  const scope = companyScopeKey(company);
  const cacheId = `capture-${viewport}${opts.actions !== undefined && opts.actions.length > 0 ? "-nav" : ""}`;
  // Charge only when we're going to actually capture (a cache hit is free).
  const cached = ctx.force ? null : await ctx.cache.get(`${scope}:${cacheId}`);
  if (cached !== null && cached !== undefined) return cached as CaptureResult;

  if (!ctx.costMeter.tryCharge(COST_MICROS.capture, `capture:${viewport}`)) return null;

  const result = await ctx.capture({
    url,
    viewport,
    ...(opts.fullPage === undefined ? {} : { fullPage: opts.fullPage }),
    ...(opts.collect === undefined ? {} : { collect: opts.collect }),
    ...(opts.actions === undefined ? {} : { actions: opts.actions }),
  });
  // Only cache a successful capture, so a transient failure isn't frozen for the whole TTL.
  if (result.ok) await ctx.cache.set(`${scope}:${cacheId}`, result, CAPTURE_TTL_SECONDS);
  return result;
}

/** Fetches the homepage HTML once, cached by domain (successful fetches only). */
export async function getHomepage(
  ctx: AuditContext,
  company: AuditCompanyInput,
  url: string,
): Promise<SafeFetchResult> {
  const scope = companyScopeKey(company);
  const cacheKey = `${scope}:web.homepage`;
  if (!ctx.force) {
    const cached = await ctx.cache.get(cacheKey);
    if (cached !== null && cached !== undefined) return cached as SafeFetchResult;
  }
  const result = await ctx.safeFetch(url, { timeoutMs: 10_000, maxBytes: 2_000_000, respectRobots: true });
  if (result.ok && result.body !== null) await ctx.cache.set(cacheKey, result, CAPTURE_TTL_SECONDS);
  return result;
}
