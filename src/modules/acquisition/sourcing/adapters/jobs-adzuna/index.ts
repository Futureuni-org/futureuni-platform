import "server-only";

/**
 * Adzuna jobs adapter (Phase 8) — DISABLED by default. Adzuna's commercial use is a 14-day trial
 * only, and its terms forbid contacting listing suppliers, so the adapter is built and mocked but
 * never runs until FUTUREUNI holds a licence that permits outreach (docs/integrations.md). The real
 * mapping below is kept ready for that day. Re-verified 2026-10-01.
 */

import { z } from "zod";

import type { Market } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter, type EstimateContext, type InternalSourceAdapter } from "../types";
import { fetchJson } from "../_shared/provider-http";
import { jobPostingsToSignals, type RawJobPosting } from "../_shared/jobs";

const ParamsSchema = z.object({
  resultsPerPage: z.int().min(1).max(50).default(20),
});
type Params = z.infer<typeof ParamsSchema>;

/** Adzuna supports these markets; others have no coverage (Nigeria is not covered). */
const COUNTRY_BY_FALLBACK: Readonly<Record<Market, string | null>> = {
  NIGERIA: null,
  INTERNATIONAL: "gb",
};

interface AdzunaResult {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url?: string;
  created?: string;
}
interface AdzunaResponse {
  results?: AdzunaResult[];
}

function parseCreds(raw: string | null): { appId: string; appKey: string } | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "appId" in parsed &&
      "appKey" in parsed &&
      typeof (parsed as { appId: unknown }).appId === "string" &&
      typeof (parsed as { appKey: unknown }).appKey === "string"
    ) {
      return parsed as { appId: string; appKey: string };
    }
  } catch {
    // not JSON
  }
  return null;
}

function toPosting(result: AdzunaResult): RawJobPosting | null {
  if (result.id === undefined || result.title === undefined || result.redirect_url === undefined) {
    return null;
  }
  const company = result.company?.display_name;
  if (company === undefined) return null;
  return {
    externalId: result.id,
    title: result.title,
    companyName: company,
    ...(result.location?.display_name === undefined
      ? {}
      : { location: result.location.display_name }),
    ...(result.description === undefined ? {} : { snippet: result.description }),
    ...(result.created === undefined ? {} : { postedAt: result.created }),
    url: result.redirect_url,
  };
}

async function* search(params: Params, ctx: SourceContext): AsyncIterable<RawSignal> {
  const country = ctx.location.country?.toLowerCase() ?? COUNTRY_BY_FALLBACK[ctx.market];
  if (country === null) {
    ctx.log.warn("jobs-adzuna does not cover this market", { market: ctx.market });
    return;
  }
  const creds = parseCreds(await ctx.resolveKey("adzuna"));
  if (creds === null) {
    ctx.log.warn("jobs-adzuna has no app id/key; skipping");
    return;
  }
  const postings: RawJobPosting[] = [];
  for (const title of ctx.keywords) {
    if (ctx.signal.aborted) break;
    if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) break;
    const query = new URLSearchParams({
      app_id: creds.appId,
      app_key: creds.appKey,
      what: title,
      where: ctx.location.text,
      results_per_page: String(params.resultsPerPage),
      "content-type": "application/json",
    });
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${query.toString()}`;
    const response = await fetchJson<AdzunaResponse>(url, { signal: ctx.signal });
    if (!response.ok || response.data === null) {
      ctx.log.warn("jobs-adzuna query failed", { title, status: response.status });
      if (response.exhausted) break;
      continue;
    }
    for (const result of response.data.results ?? []) {
      const posting = toPosting(result);
      if (posting !== null) postings.push(posting);
    }
  }
  yield* jobPostingsToSignals("jobs-adzuna", postings, ctx);
}

export const adapter: InternalSourceAdapter<Params> = {
  id: "jobs-adzuna",
  label: "Adzuna",
  description: "International job posts hiring for a service line (enabled only with a licence).",
  markets: ["INTERNATIONAL"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: (_params: Params, ctx: EstimateContext) => ctx.keywords.length,
  rateLimit: { perSecond: 1, perDay: 250 },
  costPerCallMicros: 0, // licensed; no public per-call price
  termsNotes:
    "Commercial use beyond a 14-day trial needs a licence; terms forbid contacting listing suppliers; Nigeria is not covered. DISABLED until a licence exists.",
  docsUrl: "https://developer.adzuna.com/",
  termsUrl: "https://developer.adzuna.com/docs/terms_of_service",
  requiresCredential: "adzuna",
  status: "DISABLED",
  disabledReason:
    "Adzuna commercial use is a 14-day trial only and its terms forbid contacting listing suppliers; enable only once FUTUREUNI holds a licence (docs/integrations.md).",
};

export default defineAdapter(adapter);
