import "server-only";

/**
 * Apple App Store adapter (Phase 8, UI/UX line). Finds apps in the target categories via the
 * iTunes Search API, then reads recent reviews via the legacy customer-reviews RSS (JSON variant)
 * to detect usability complaints. Emits `app_low_rating` and `app_reviews_usability_complaints`
 * (these supersede the prompt's older names `low_rating`/`usability_complaints_candidate`).
 *
 * No API key. The reviews RSS is legacy and undocumented, so it's best-effort: a review fetch that
 * fails drops only the reviews signal for that app, never the run. App artwork is never stored or
 * displayed (promotional-content terms). See this folder's README and module spec §3.5.1.
 */

import { z } from "zod";

import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter, type EstimateContext, type InternalSourceAdapter } from "../types";
import { fetchJson } from "../_shared/provider-http";

const SEARCH_URL = "https://itunes.apple.com/search";

const ParamsSchema = z.object({
  country: z.string().length(2).optional(),
  maxRating: z.number().min(0).max(5).default(3.5),
  minRatings: z.int().min(0).max(100_000).default(20),
  resultsPerCategory: z.int().min(1).max(50).default(25),
  maxReviews: z.int().min(1).max(200).default(50),
});
type Params = z.infer<typeof ParamsSchema>;

/** Review phrases that signal a usability problem (matched case-insensitively). */
const USABILITY_THEMES: readonly { theme: string; patterns: RegExp }[] = [
  { theme: "confusing navigation", patterns: /confus|hard to (use|navigate)|can'?t find|where is/i },
  { theme: "signup or login trouble", patterns: /sign ?up|log ?in|sign ?in|register|verif|can'?t (log|sign)/i },
  { theme: "crashes on key flows", patterns: /crash|freez|keeps? closing|won'?t open|stuck/i },
  { theme: "cluttered or unclear UI", patterns: /clutter|too many steps|not intuitive|unclear|complicated/i },
];

interface ItunesApp {
  trackId?: number;
  trackName?: string;
  sellerName?: string;
  sellerUrl?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  trackViewUrl?: string;
  primaryGenreName?: string;
}
interface ItunesSearchResponse {
  resultCount?: number;
  results?: ItunesApp[];
}
interface RssEntry {
  content?: { label?: string };
  title?: { label?: string };
  "im:rating"?: { label?: string };
}
interface ReviewsResponse {
  feed?: { entry?: RssEntry[] | RssEntry };
}

function countryFor(params: Params, ctx: SourceContext): string {
  return (params.country ?? ctx.location.country ?? (ctx.market === "NIGERIA" ? "NG" : "US")).toLowerCase();
}

/** Latest review texts (skips the first entry, which is the app's own feed metadata). */
function reviewTexts(response: ReviewsResponse, max: number): string[] {
  const raw = response.feed?.entry;
  if (raw === undefined) return [];
  const entries = Array.isArray(raw) ? raw : [raw];
  const reviews = entries.filter((entry) => entry["im:rating"] !== undefined);
  return reviews
    .slice(0, max)
    .map((entry) => `${entry.title?.label ?? ""} ${entry.content?.label ?? ""}`.trim())
    .filter((text) => text !== "");
}

function themesMentioned(texts: readonly string[]): { count: number; themes: string[] } {
  const themes = new Set<string>();
  let count = 0;
  for (const text of texts) {
    const hit = USABILITY_THEMES.find((entry) => entry.patterns.test(text));
    if (hit !== undefined) {
      count += 1;
      themes.add(hit.theme);
    }
  }
  return { count, themes: [...themes] };
}

async function* search(params: Params, ctx: SourceContext): AsyncIterable<RawSignal> {
  const cc = countryFor(params, ctx);
  let emitted = 0;

  for (const term of ctx.keywords) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) return;

    const url = `${SEARCH_URL}?term=${encodeURIComponent(term)}&country=${cc}&media=software&limit=${String(params.resultsPerCategory)}`;
    const response = await fetchJson<ItunesSearchResponse>(url, { signal: ctx.signal });
    if (!response.ok || response.data === null) {
      ctx.log.warn("itunes search failed", { term, status: response.status });
      if (response.exhausted) return;
      continue;
    }

    for (const app of response.data.results ?? []) {
      if (emitted >= ctx.limit) return;
      if (app.trackId === undefined) continue;
      const rating = app.averageUserRating ?? 0;
      const ratingCount = app.userRatingCount ?? 0;
      const externalId = String(app.trackId);
      const base = {
        adapterId: "apple-app-store" as const,
        companyName: app.sellerName ?? app.trackName ?? `App ${externalId}`,
        ...(app.sellerUrl === undefined ? {} : { website: app.sellerUrl }),
        country: cc.toUpperCase(),
        sourceUrl: app.trackViewUrl ?? `https://apps.apple.com/${cc}/app/id${externalId}`,
        observedAt: ctx.clock.now().toISOString(),
        externalRef: { adapterId: "apple-app-store" as const, externalId },
      };

      if (rating > 0 && rating < params.maxRating && ratingCount >= params.minRatings) {
        yield {
          ...base,
          signalType: "app_low_rating",
          evidenceText: `App "${app.trackName ?? externalId}" has a ${rating.toFixed(1)} rating from ${String(ratingCount)} ratings.`,
          evidence: { rating, ratingCount, genre: app.primaryGenreName ?? null },
        };
        emitted += 1;
        if (emitted >= ctx.limit) return;
      }

      // Reviews: best-effort. A failure drops this signal only.
      if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) return;
      const reviewsUrl = `https://itunes.apple.com/${cc}/rss/customerreviews/id=${externalId}/sortBy=mostRecent/json`;
      const reviews = await fetchJson<ReviewsResponse>(reviewsUrl, { signal: ctx.signal });
      if (!reviews.ok || reviews.data === null) continue;
      const texts = reviewTexts(reviews.data, params.maxReviews);
      const { count, themes } = themesMentioned(texts);
      if (count >= 3 && themes.length > 0) {
        yield {
          ...base,
          signalType: "app_reviews_usability_complaints",
          evidenceText: `${String(count)} of the latest ${String(texts.length)} reviews mention ${themes.join(", ")}.`,
          evidence: { complaintCount: count, reviewsScanned: texts.length, themes: themes.join("; ") },
        };
        emitted += 1;
      }
    }
  }
}

export const adapter: InternalSourceAdapter<Params> = {
  id: "apple-app-store",
  label: "App Store",
  description: "Apps with low ratings or usability complaints in their App Store reviews (UI/UX line).",
  markets: ["NIGERIA", "INTERNATIONAL"],
  supportedServiceLines: ["UI_UX_DESIGN"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: (_params: Params, ctx: EstimateContext) => ctx.keywords.length * 2,
  rateLimit: { perSecond: 0.3, perDay: null }, // ~20 calls/minute
  costPerCallMicros: 0, // free API
  termsNotes:
    "iTunes Search API ~20 calls/min; customer-reviews RSS is legacy/undocumented (best-effort); app artwork is never stored or displayed (promotional-content terms).",
  docsUrl: "https://performance-partners.apple.com/search-api",
  termsUrl: "https://performance-partners.apple.com/search-api",
  requiresCredential: null,
  status: "ENABLED",
};

export default defineAdapter(adapter);
