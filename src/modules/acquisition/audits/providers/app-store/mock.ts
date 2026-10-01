/**
 * Deterministic App Store reviews mock. Produces a realistic spread of ratings and usability-themed
 * review text. An appId containing "buggy" skews negative; "loved" skews positive.
 */

import "server-only";

import { summarise, type AppReview, type AppReviews } from "./index";

const NEGATIVE = [
  "The onboarding takes too many steps and I gave up before finishing sign up.",
  "App crashes every time I open the settings screen.",
  "Navigation is confusing — I can never find the search button.",
  "It's very slow to load on my phone and freezes often.",
  "The buttons are tiny and hard to tap, especially the checkout.",
];
const POSITIVE = [
  "Clean design and the sign up was quick and simple.",
  "Fast and reliable, I use it every day.",
  "Easy to navigate and everything is where I expect it.",
  "Great update, the new layout is much clearer.",
  "Love the smooth onboarding and helpful tips.",
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function mockAppStoreReviews(appId: string, country: string): AppReviews {
  const h = hash(`${appId}:${country}`);
  const negative = appId.includes("buggy");
  const positive = appId.includes("loved");
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const reviews: AppReview[] = [];
  for (let i = 0; i < 20; i += 1) {
    const roll = (h + i * 131) % 5;
    const rating = negative ? 1 + (roll % 2) : positive ? 4 + (roll % 2) : 1 + (roll % 5);
    const pool = rating <= 2 ? NEGATIVE : POSITIVE;
    const text = pool[(h + i) % pool.length] ?? pool[0] ?? "";
    reviews.push({
      id: `rev_${appId}_${String(i)}`,
      rating,
      title: rating <= 2 ? "Frustrating" : "Nice",
      text,
      updatedAt: new Date(now - i * 2 * dayMs).toISOString(),
    });
  }
  return { appId, country, reviews, ...summarise(reviews) };
}
