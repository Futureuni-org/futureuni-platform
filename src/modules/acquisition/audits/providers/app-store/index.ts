/**
 * Apple App Store customer-reviews provider (provider id `apple-app-store`, no key). Returns recent
 * reviews from the legacy RSS feed. `mock` under `MOCKS=true`.
 *
 * The reviews RSS is legacy and undocumented (best effort). Google Play has no compliant public
 * reviews API, so Play reviews are never fetched (`NOT_ASSESSED`). Docs:
 * https://performance-partners.apple.com/search-api
 */

import "server-only";

import { env } from "@/env";

export interface AppReview {
  id: string;
  rating: number; // 1–5
  title: string;
  text: string;
  updatedAt: string; // ISO
}

export interface AppReviews {
  appId: string;
  country: string;
  reviews: AppReview[]; // newest first
  averageRating: number | null;
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export async function getAppStoreReviews(appId: string, country = "us"): Promise<AppReviews | null> {
  if (env.MOCKS) {
    const { mockAppStoreReviews } = await import("./mock");
    return mockAppStoreReviews(appId, country);
  }
  const { realAppStoreReviews } = await import("./real");
  return realAppStoreReviews(appId, country);
}

export function emptyDistribution(): Record<"1" | "2" | "3" | "4" | "5", number> {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
}

export function summarise(reviews: AppReview[]): Pick<AppReviews, "averageRating" | "ratingDistribution"> {
  const ratingDistribution = emptyDistribution();
  let sum = 0;
  for (const r of reviews) {
    const bucket = String(Math.min(5, Math.max(1, Math.round(r.rating)))) as "1" | "2" | "3" | "4" | "5";
    ratingDistribution[bucket] += 1;
    sum += r.rating;
  }
  return {
    averageRating: reviews.length === 0 ? null : Number((sum / reviews.length).toFixed(2)),
    ratingDistribution,
  };
}
