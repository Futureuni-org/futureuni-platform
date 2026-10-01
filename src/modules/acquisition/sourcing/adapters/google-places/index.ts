import "server-only";

/**
 * Google Places API (New) Text Search adapter (Phase 8). Finds local businesses and emits the
 * `no_website`, `ecommerce_on_social_only` (Nigeria) and `new_business` signals.
 *
 * INV-14 / Maps Platform terms: we may keep the `place_id` indefinitely but must NOT store Places
 * content (business name, address, phone, reviews). So this adapter sets `externalRef` (the
 * `place_id`), keeps `evidence` to facts we derive (`websiteKind`, `reviewCountUnder10`), stores no
 * `rawPayload`, and the directory persists a Places-only company as a placeholder (it drops the
 * listing's name/address/phone). The listing's fields travel on the `RawSignal` for matching and
 * market derivation within the run only. See docs/specs/module-acquisition.md §3.5.1 and this
 * folder's README.
 */

import { z } from "zod";

import type { RawSignal, SourceContext } from "@/contracts/source-adapter";
import { classifyWebsite } from "@/platform/directory";

import { defineAdapter, type EstimateContext, type InternalSourceAdapter } from "../types";
import { fetchJson } from "../_shared/provider-http";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
// Only the fields we need. websiteUri and nationalPhoneNumber put Text Search on the Enterprise
// SKU; we request them because they drive the no_website signal and matching, and estimate cost.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
].join(",");

const ParamsSchema = z.object({
  regionCode: z.string().length(2).optional(),
  maxResultsPerQuery: z.int().min(1).max(20).default(20),
  reviewCountThreshold: z.int().min(1).max(100).default(10),
});
type Params = z.infer<typeof ParamsSchema>;

interface PlacesAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}
interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlacesAddressComponent[];
  websiteUri?: string;
  nationalPhoneNumber?: string;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
}
interface SearchTextResponse {
  places?: Place[];
  nextPageToken?: string;
}

function componentOfType(place: Place, type: string): PlacesAddressComponent | undefined {
  return place.addressComponents?.find((component) => component.types?.includes(type));
}

function mapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

/** The signals one place yields. `no_website` when there's no own site; `ecommerce_on_social_only` */
/** (Nigeria) when that no-site presence is a social profile; `new_business` when reviews are few. */
function* signalsForPlace(place: Place, params: Params, ctx: SourceContext): Iterable<RawSignal> {
  const website = place.websiteUri ?? null;
  const websiteKind = classifyWebsite(website);
  const hasOwnSite = websiteKind === "OWN_SITE";
  const country = componentOfType(place, "country")?.shortText ?? undefined;
  const city = componentOfType(place, "locality")?.longText ?? undefined;
  const region = componentOfType(place, "administrative_area_level_1")?.longText ?? undefined;
  const reviewCount = place.userRatingCount ?? 0;

  const base = {
    adapterId: "google-places" as const,
    companyName: place.displayName?.text ?? `Place ${place.id.slice(-6)}`,
    ...(website === null ? {} : { website }),
    ...(place.nationalPhoneNumber === undefined ? {} : { phone: place.nationalPhoneNumber }),
    address: {
      ...(place.formattedAddress === undefined ? {} : { line: place.formattedAddress }),
      ...(city === undefined ? {} : { city }),
      ...(region === undefined ? {} : { region }),
      ...(country === undefined ? {} : { country }),
    },
    ...(country === undefined ? {} : { country }),
    sourceUrl: mapsUrl(place.id),
    observedAt: ctx.clock.now().toISOString(),
    externalRef: { adapterId: "google-places" as const, externalId: place.id },
  };

  if (!hasOwnSite) {
    const social = websiteKind === "SOCIAL_ONLY";
    // Nigeria: a social-only presence is the "selling through DMs" signal; otherwise it's no_website.
    const signalType =
      ctx.market === "NIGERIA" && social ? "ecommerce_on_social_only" : "no_website";
    yield {
      ...base,
      signalType,
      evidenceText:
        signalType === "ecommerce_on_social_only"
          ? "Google Maps listing links only to a social profile, with no own website to order from."
          : "Google Maps listing has no own website (no website field, or only a social or marketplace link).",
      evidence: { websiteKind, reviewCountUnder10: reviewCount < params.reviewCountThreshold },
    };
  }

  if (reviewCount > 0 && reviewCount < params.reviewCountThreshold) {
    yield {
      ...base,
      signalType: "new_business",
      evidenceText: `Google Maps listing has only ${String(reviewCount)} reviews, a weak sign of a new business.`,
      evidence: { websiteKind, reviewCount },
    };
  }
}

async function* search(params: Params, ctx: SourceContext): AsyncIterable<RawSignal> {
  const key = await ctx.resolveKey("google-places");
  if (key === null) {
    ctx.log.warn("google-places has no API key; skipping");
    return;
  }
  const regionCode = params.regionCode ?? ctx.location.country ?? (ctx.market === "NIGERIA" ? "NG" : undefined);
  let emitted = 0;

  for (const keyword of ctx.keywords) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) return;

    const response = await fetchJson<SearchTextResponse>(SEARCH_TEXT_URL, {
      method: "POST",
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
      body: {
        textQuery: `${keyword} in ${ctx.location.text}`,
        maxResultCount: params.maxResultsPerQuery,
        ...(regionCode === undefined ? {} : { regionCode: regionCode.toLowerCase() }),
      },
      signal: ctx.signal,
    });
    if (!response.ok || response.data === null) {
      ctx.log.warn("google-places query failed", { keyword, status: response.status });
      if (response.exhausted) return;
      continue;
    }
    for (const place of response.data.places ?? []) {
      if (emitted >= ctx.limit) return;
      for (const signal of signalsForPlace(place, params, ctx)) {
        if (emitted >= ctx.limit) return;
        yield signal;
        emitted += 1;
      }
    }
  }
}

export const adapter: InternalSourceAdapter<Params> = {
  id: "google-places",
  label: "Google Places",
  description: "Local businesses from Google Maps: no-website, social-only and new-business signals.",
  markets: ["NIGERIA", "INTERNATIONAL"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "GRAPHIC_DESIGN"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: (_params: Params, ctx: EstimateContext) => ctx.keywords.length * ctx.locationCount,
  rateLimit: { perSecond: 10, perDay: null },
  costPerCallMicros: 35_000, // Text Search Enterprise SKU ~$35 / 1,000 with website+phone fields
  termsNotes:
    "Maps Platform terms: store place_id indefinitely; never persist Places content (name, address, phone, reviews). No rawPayload; evidence holds derived facts only.",
  docsUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
  termsUrl: "https://cloud.google.com/maps-platform/terms",
  requiresCredential: "google-places",
  status: "ENABLED",
};

export default defineAdapter(adapter);
