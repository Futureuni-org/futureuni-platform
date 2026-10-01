import "server-only";

/**
 * Mock App Store adapter (ADR-005): realistic fixtures for both markets, used when `MOCKS=true`.
 * Mirrors the real adapter, charges `ctx.budget`, honours `ctx.limit`, and throws on the
 * `force-adapter-error` keyword (the runner's resilience test).
 */

import type { Market } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter } from "../types";
import { adapter as real } from "./index";

type Fixture = Omit<RawSignal, "adapterId" | "observedAt">;

const FIXTURES: Readonly<Record<Market, Fixture[]>> = {
  NIGERIA: [
    {
      companyName: "PayQuick Technologies",
      website: "https://payquick.ng",
      country: "NG",
      signalType: "app_low_rating",
      evidenceText: 'App "PayQuick" has a 2.9 rating from 340 ratings.',
      evidence: { rating: 2.9, ratingCount: 340, genre: "Finance" },
      sourceUrl: "https://apps.apple.com/ng/app/id1111111111",
      externalRef: { adapterId: "apple-app-store", externalId: "1111111111" },
    },
    {
      companyName: "PayQuick Technologies",
      website: "https://payquick.ng",
      country: "NG",
      signalType: "app_reviews_usability_complaints",
      evidenceText: "4 of the latest 50 reviews mention signup or login trouble, confusing navigation.",
      evidence: { complaintCount: 4, reviewsScanned: 50, themes: "signup or login trouble; confusing navigation" },
      sourceUrl: "https://apps.apple.com/ng/app/id1111111111",
      externalRef: { adapterId: "apple-app-store", externalId: "1111111111" },
    },
  ],
  INTERNATIONAL: [
    {
      companyName: "Brightwave Labs",
      website: "https://brightwave.io",
      country: "US",
      signalType: "app_low_rating",
      evidenceText: 'App "Brightwave Budget" has a 3.1 rating from 1,280 ratings.',
      evidence: { rating: 3.1, ratingCount: 1280, genre: "Finance" },
      sourceUrl: "https://apps.apple.com/us/app/id2222222222",
      externalRef: { adapterId: "apple-app-store", externalId: "2222222222" },
    },
    {
      companyName: "Brightwave Labs",
      website: "https://brightwave.io",
      country: "US",
      signalType: "app_reviews_usability_complaints",
      evidenceText: "6 of the latest 50 reviews mention confusing navigation, signup or login trouble.",
      evidence: { complaintCount: 6, reviewsScanned: 50, themes: "confusing navigation; signup or login trouble" },
      sourceUrl: "https://apps.apple.com/us/app/id2222222222",
      externalRef: { adapterId: "apple-app-store", externalId: "2222222222" },
    },
    // A well-rated app yields nothing: it is simply absent from the fixtures.
  ],
};

async function* search(_params: unknown, ctx: SourceContext): AsyncIterable<RawSignal> {
  await Promise.resolve(); // satisfies require-await; the mock yields fixtures synchronously
  if (ctx.keywords.includes("force-adapter-error")) {
    throw new Error("mock apple-app-store forced failure");
  }
  let emitted = 0;
  for (const fixture of FIXTURES[ctx.market]) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, 0)) return;
    yield { ...fixture, adapterId: "apple-app-store", observedAt: ctx.clock.now().toISOString() };
    emitted += 1;
  }
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
