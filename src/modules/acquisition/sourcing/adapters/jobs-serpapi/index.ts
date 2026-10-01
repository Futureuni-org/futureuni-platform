import "server-only";

/**
 * SerpAPI Google Jobs adapter (Phase 8). Finds job posts hiring for a FUTUREUNI line and emits the
 * `job_post_<role>` signals via the shared job pipeline (which classifies out recruitment agencies
 * and full in-house teams). Queries come from the line's job titles (`ctx.keywords`) and the
 * search location.
 *
 * Supply risk: Google v. SerpApi (filed Dec 2025) is ongoing; this stays behind the adapter so a
 * different jobs provider can replace it. See README. Re-verified 2026-10-01.
 */

import { z } from "zod";

import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter, type EstimateContext, type InternalSourceAdapter } from "../types";
import { fetchJson } from "../_shared/provider-http";
import { jobPostingsToSignals, type RawJobPosting } from "../_shared/jobs";

const SEARCH_URL = "https://serpapi.com/search.json";

const ParamsSchema = z.object({
  postedWithinDays: z.int().min(1).max(365).default(30),
});
type Params = z.infer<typeof ParamsSchema>;

interface SerpJob {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  detected_extensions?: { posted_at?: string };
  share_link?: string;
  apply_options?: { link?: string }[];
  related_links?: { link?: string; text?: string }[];
}
interface SerpResponse {
  jobs_results?: SerpJob[];
}

function pickUrl(job: SerpJob): string | null {
  if (typeof job.share_link === "string" && job.share_link.length > 0) return job.share_link;
  const apply = job.apply_options?.find((o) => typeof o.link === "string" && o.link.length > 0);
  if (apply?.link !== undefined) return apply.link;
  const related = job.related_links?.find((r) => typeof r.link === "string" && r.link.length > 0);
  return related?.link ?? null;
}

function pickCompanyWebsite(job: SerpJob): string | undefined {
  const site = job.related_links?.find(
    (r) => typeof r.link === "string" && /website|homepage|official/i.test(r.text ?? ""),
  );
  return site?.link ?? undefined;
}

function toPosting(job: SerpJob): RawJobPosting | null {
  const url = pickUrl(job);
  if (job.job_id === undefined || job.title === undefined || job.company_name === undefined) {
    return null;
  }
  if (url === null) return null;
  const website = pickCompanyWebsite(job);
  return {
    externalId: job.job_id,
    title: job.title,
    companyName: job.company_name,
    ...(website === undefined ? {} : { companyWebsite: website }),
    ...(job.location === undefined ? {} : { location: job.location }),
    ...(job.description === undefined ? {} : { snippet: job.description }),
    url,
  };
}

async function* search(params: Params, ctx: SourceContext): AsyncIterable<RawSignal> {
  const key = await ctx.resolveKey("serpapi");
  if (key === null) {
    ctx.log.warn("jobs-serpapi has no API key; skipping");
    return;
  }
  const postings: RawJobPosting[] = [];
  for (const title of ctx.keywords) {
    if (ctx.signal.aborted) break;
    if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) break;
    const query = new URLSearchParams({
      engine: "google_jobs",
      q: title,
      location: ctx.location.text,
      api_key: key,
    });
    if (params.postedWithinDays <= 31) query.set("chips", "date_posted:month");
    const response = await fetchJson<SerpResponse>(`${SEARCH_URL}?${query.toString()}`, {
      signal: ctx.signal,
    });
    if (!response.ok || response.data === null) {
      ctx.log.warn("jobs-serpapi query failed", { title, status: response.status });
      if (response.exhausted) break;
      continue;
    }
    for (const job of response.data.jobs_results ?? []) {
      const posting = toPosting(job);
      if (posting !== null) postings.push(posting);
    }
  }
  yield* jobPostingsToSignals("jobs-serpapi", postings, ctx);
}

export const adapter: InternalSourceAdapter<Params> = {
  id: "jobs-serpapi",
  label: "SerpAPI (Google Jobs)",
  description: "Job posts hiring for a service line, from the Google Jobs engine.",
  markets: ["NIGERIA", "INTERNATIONAL"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: (_params: Params, ctx: EstimateContext) => ctx.keywords.length,
  rateLimit: { perSecond: 2, perDay: null },
  costPerCallMicros: 25_000, // SerpApi Starter ~$25 / 1,000 successful searches
  termsNotes:
    "SerpApi retains search data for 31 days. Only successful searches are billed. Google v. SerpApi (Dec 2025) is ongoing — a supply-continuity risk kept behind this adapter.",
  docsUrl: "https://serpapi.com/google-jobs-api",
  termsUrl: "https://serpapi.com/legal",
  requiresCredential: "serpapi",
  status: "ENABLED",
};

export default defineAdapter(adapter);
