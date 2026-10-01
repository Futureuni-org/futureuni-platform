import "server-only";

/**
 * Mock Google Places adapter (ADR-005): realistic fixtures for both markets, used when `MOCKS=true`
 * or no key is set. It mirrors the real adapter's interface and still charges `ctx.budget`, so
 * budget and limit tests work against the mock. A keyword of `force-adapter-error` makes it throw,
 * for the runner's resilience test (one adapter failing → PARTIAL run).
 */

import type { Market } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter } from "../types";
import { adapter as real } from "./index";

type Fixture = Omit<RawSignal, "adapterId" | "observedAt">;

const FIXTURES: Readonly<Record<Market, Fixture[]>> = {
  NIGERIA: [
    {
      companyName: "Mama Put Kitchen",
      phone: "+2348031234567",
      address: { line: "12 Admiralty Way, Lekki", city: "Lekki", region: "Lagos", country: "NG" },
      country: "NG",
      socials: { instagram: "https://www.instagram.com/mamaputkitchen" },
      signalType: "ecommerce_on_social_only",
      evidenceText:
        "Google Maps listing links only to an Instagram profile, with no own website to order from.",
      evidence: { websiteKind: "SOCIAL_ONLY", reviewCountUnder10: false },
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJmamaput000000000000000",
      externalRef: { adapterId: "google-places", externalId: "ChIJmamaput000000000000000" },
    },
    {
      // A duplicate of Mama Put across sources (same phone, different place_id): dedupe by phone.
      companyName: "Mama Put",
      phone: "0803 123 4567",
      address: { city: "Lagos", region: "Lagos", country: "NG" },
      country: "NG",
      signalType: "new_business",
      evidenceText: "Google Maps listing has only 6 reviews, a weak sign of a new business.",
      evidence: { websiteKind: "SOCIAL_ONLY", reviewCount: 6 },
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJmamaput999999999999999",
      externalRef: { adapterId: "google-places", externalId: "ChIJmamaput999999999999999" },
    },
    {
      companyName: "Bright Smiles Clinic",
      phone: "+2348090000001",
      address: { line: "3 Warri Road", city: "Warri", region: "Delta", country: "NG" },
      country: "NG",
      socials: { instagram: "https://www.instagram.com/brightsmileswarri" },
      signalType: "ecommerce_on_social_only",
      evidenceText: "Google Maps listing links only to an Instagram profile, with no own website.",
      evidence: { websiteKind: "SOCIAL_ONLY", reviewCountUnder10: true },
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJbrightsmiles0000000000",
      externalRef: { adapterId: "google-places", externalId: "ChIJbrightsmiles0000000000" },
    },
    {
      // Out of market for a NIGERIA search (country GB): the runner drops and counts it.
      companyName: "London Bites",
      phone: "+442079460000",
      address: { city: "London", country: "GB" },
      country: "GB",
      signalType: "no_website",
      evidenceText: "Google Maps listing has no own website.",
      evidence: { websiteKind: "NONE", reviewCountUnder10: false },
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJlondonbites00000000000",
      externalRef: { adapterId: "google-places", externalId: "ChIJlondonbites00000000000" },
    },
  ],
  INTERNATIONAL: [
    {
      // Own site: yields no signal (the real adapter emits nothing for an own-site listing).
      companyName: "Northgate Web Studio",
      website: "https://northgatestudio.co.uk",
      address: { city: "Manchester", country: "GB" },
      country: "GB",
      signalType: "new_business",
      evidenceText: "Google Maps listing has only 4 reviews, a weak sign of a new business.",
      evidence: { websiteKind: "OWN_SITE", reviewCount: 4 },
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJnorthgate00000000000000",
      externalRef: { adapterId: "google-places", externalId: "ChIJnorthgate00000000000000" },
    },
    {
      companyName: "Elm Street Dental",
      phone: "+441612000000",
      address: { line: "22 Elm Street", city: "Manchester", country: "GB" },
      country: "GB",
      signalType: "no_website",
      evidenceText: "Google Maps listing has no own website (only a Facebook page).",
      evidence: { websiteKind: "SOCIAL_ONLY", reviewCountUnder10: false },
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:ChIJelmdental00000000000000",
      externalRef: { adapterId: "google-places", externalId: "ChIJelmdental00000000000000" },
    },
  ],
};

async function* search(_params: unknown, ctx: SourceContext): AsyncIterable<RawSignal> {
  await Promise.resolve(); // satisfies require-await; the mock yields fixtures synchronously
  if (ctx.keywords.includes("force-adapter-error")) {
    throw new Error("mock google-places forced failure");
  }
  let emitted = 0;
  for (const fixture of FIXTURES[ctx.market]) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, real.costPerCallMicros)) return;
    yield { ...fixture, adapterId: "google-places", observedAt: ctx.clock.now().toISOString() };
    emitted += 1;
  }
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
