import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import type { RawSignal, SourceContext } from "@/contracts/source-adapter";
import { server } from "@/tests/setup/msw-server";

import { adapter } from "./index";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

function makeCtx(overrides: Partial<SourceContext> = {}): SourceContext {
  return {
    searchRunId: "run_test",
    serviceLine: "WEB_DEVELOPMENT",
    market: "INTERNATIONAL",
    location: { market: "INTERNATIONAL", text: "Manchester", country: "GB" },
    keywords: ["restaurants"],
    limit: 50,
    actor: { type: "SYSTEM", job: "acquisition.sourcing.run" },
    clock: { now: () => new Date("2026-10-01T09:00:00Z") },
    signal: new AbortController().signal,
    budget: { tryCharge: () => true, remaining: () => ({ calls: 999, costMicros: 999_999 }) },
    resolveKey: () => Promise.resolve("test-key"),
    safeFetch: () => Promise.reject(new Error("safeFetch not used here")),
    log: { info: () => undefined, warn: () => undefined },
    ...overrides,
  };
}

async function collect(ctx: SourceContext): Promise<RawSignal[]> {
  const out: RawSignal[] = [];
  for await (const signal of adapter.search(adapter.paramsSchema.parse({}), ctx)) out.push(signal);
  return out;
}

afterEach(() => {
  server.resetHandlers();
});

describe("google-places adapter mapping", () => {
  it("maps places to no_website and new_business signals, and skips healthy own sites", async () => {
    server.use(
      http.post(SEARCH_URL, () =>
        HttpResponse.json({
          places: [
            {
              id: "ChIJnowebsite0000000000",
              displayName: { text: "Elm Street Dental" },
              formattedAddress: "22 Elm Street, Manchester",
              addressComponents: [{ types: ["country"], shortText: "GB" }],
              userRatingCount: 3,
            },
            {
              id: "ChIJownsite00000000000000",
              displayName: { text: "Northgate Studio" },
              websiteUri: "https://northgate.co.uk",
              addressComponents: [{ types: ["country"], shortText: "GB" }],
              userRatingCount: 50,
            },
          ],
        }),
      ),
    );

    const signals = await collect(makeCtx());
    const byPlace = new Map<string, string[]>();
    for (const s of signals) {
      const id = s.externalRef?.externalId ?? "?";
      byPlace.set(id, [...(byPlace.get(id) ?? []), s.signalType]);
    }
    // No-website place: both no_website and new_business (low reviews).
    expect(byPlace.get("ChIJnowebsite0000000000")).toEqual(
      expect.arrayContaining(["no_website", "new_business"]),
    );
    // Healthy own site with many reviews: no signal.
    expect(byPlace.has("ChIJownsite00000000000000")).toBe(false);
    // Every signal carries a Maps source URL and the place_id externalRef (INV-14).
    for (const s of signals) {
      expect(s.sourceUrl).toContain("place_id:");
      expect(s.externalRef?.adapterId).toBe("google-places");
      expect(s.rawPayload).toBeUndefined();
    }
  });

  it("emits ecommerce_on_social_only for a Nigerian social-only listing", async () => {
    server.use(
      http.post(SEARCH_URL, () =>
        HttpResponse.json({
          places: [
            {
              id: "ChIJsocial000000000000000",
              displayName: { text: "Mama Put" },
              websiteUri: "https://www.instagram.com/mamaput",
              addressComponents: [{ types: ["country"], shortText: "NG" }],
              userRatingCount: 40,
            },
          ],
        }),
      ),
    );
    const signals = await collect(makeCtx({ market: "NIGERIA", location: { market: "NIGERIA", text: "Lagos", country: "NG" } }));
    expect(signals.map((s) => s.signalType)).toContain("ecommerce_on_social_only");
  });
});
