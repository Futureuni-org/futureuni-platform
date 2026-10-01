/**
 * Real Apple App Store customer-reviews fetch via the legacy RSS JSON feed. No key required. The
 * first feed entry is app metadata, not a review, so it's skipped.
 */

import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";

import { summarise, type AppReview, type AppReviews } from "./index";

const TIMEOUT_MS = 15_000;

const LabelValue = z.object({ label: z.string() }).optional();
const Entry = z.object({
  id: LabelValue,
  title: LabelValue,
  content: LabelValue,
  "im:rating": LabelValue,
  updated: LabelValue,
});
const Feed = z.object({
  feed: z.object({ entry: z.array(Entry).optional() }).optional(),
});

export async function realAppStoreReviews(appId: string, country: string): Promise<AppReviews | null> {
  const url = `https://itunes.apple.com/${country}/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new AppError("PROVIDER_ERROR", `App Store reviews returned ${String(res.status)}.`);
    const parsed = Feed.parse(await res.json());
    const entries = parsed.feed?.entry ?? [];
    // The first entry describes the app, not a review; it has no im:rating.
    const reviews: AppReview[] = entries
      .filter((e) => e["im:rating"]?.label !== undefined)
      .map((e) => ({
        id: e.id?.label ?? crypto.randomUUID(),
        rating: Number(e["im:rating"]?.label ?? "0"),
        title: e.title?.label ?? "",
        text: e.content?.label ?? "",
        updatedAt: e.updated?.label ?? new Date().toISOString(),
      }));
    return { appId, country, reviews, ...summarise(reviews) };
  } catch (err) {
    if (err instanceof AppError) throw err;
    return null;
  } finally {
    clearTimeout(timer);
  }
}
