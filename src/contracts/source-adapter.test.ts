import { describe, expect, it } from "vitest";

import {
  ADAPTER_PROVIDER,
  ADAPTER_SIGNAL_TYPES,
  DerivedSignalDetectorSchema,
  RawSignalSchema,
  SearchSpecSchema,
  SourceAdapterIdSchema,
} from "./source-adapter";
import { issuePaths } from "./test-helpers";

describe("source-adapter contract", () => {
  it("parses the worked example (docs/contracts/source-adapter.md §4)", () => {
    const signal = RawSignalSchema.parse({
      adapterId: "google-places",
      companyName: "Mama Put Kitchen",
      phone: "0803 123 4567",
      address: { line: "12 Admiralty Way", city: "Lekki", region: "Lagos", country: "NG" },
      country: "NG",
      socials: { instagram: "https://www.instagram.com/mamaputkitchen" },
      signalType: "no_website",
      evidenceText:
        "Google Maps listing has no website field; the only link is an Instagram profile.",
      evidence: { websiteKind: "SOCIAL_ONLY", reviewCountUnder10: false },
      sourceUrl: "https://maps.google.com/?cid=1234567890123456789",
      observedAt: "2026-10-03T08:15:00Z",
      externalRef: { adapterId: "google-places", externalId: "ChIJ0000000000000000000000" },
    });
    expect(signal.signalType).toBe("no_website");

    const spec = SearchSpecSchema.parse({
      serviceLine: "WEB_DEVELOPMENT",
      markets: ["NIGERIA"],
      locations: [{ market: "NIGERIA", text: "Lagos", city: "Lagos", country: "NG" }],
      keywords: ["restaurants"],
      limit: 50,
    });
    expect(spec.limit).toBe(50);
  });

  it("rejects the invalid examples (§5): no sourceUrl, and a market with no location", () => {
    expect(
      issuePaths(
        RawSignalSchema.safeParse({
          adapterId: "jobs-serpapi",
          companyName: "Acme Ltd",
          signalType: "job_post_web_developer",
          evidenceText: "Hiring a web developer",
          observedAt: "2026-10-03T08:15:00Z",
        }),
      ),
    ).toEqual(["sourceUrl"]);

    const result = SearchSpecSchema.safeParse({
      serviceLine: "WEB_DEVELOPMENT",
      markets: ["NIGERIA", "INTERNATIONAL"],
      locations: [{ market: "NIGERIA", text: "Lagos" }],
      keywords: [],
      limit: 50,
    });
    expect(issuePaths(result)).toEqual(["locations"]);
    if (!result.success)
      expect(result.error.issues[0]?.message).toBe("Add a location for INTERNATIONAL");
  });

  it("lets manual and csv-import signals omit the sourceUrl (rule 3)", () => {
    const manual = {
      adapterId: "manual",
      companyName: "Adunni Bakes & Events Ltd",
      signalType: "manual_lead",
      evidenceText: "Added by hand after a referral.",
      observedAt: "2026-10-03T08:15:00Z",
    };
    expect(RawSignalSchema.safeParse(manual).success).toBe(true);
  });

  it("maps every adapter to its signal types and vault provider (§3a)", () => {
    for (const adapter of SourceAdapterIdSchema.options) {
      expect(ADAPTER_SIGNAL_TYPES[adapter].length).toBeGreaterThan(0);
      expect(adapter in ADAPTER_PROVIDER).toBe(true);
    }
    expect(ADAPTER_PROVIDER["jobs-serpapi"]).toBe("serpapi");
    expect(DerivedSignalDetectorSchema.safeParse("audit:web.ssl").success).toBe(true);
    expect(DerivedSignalDetectorSchema.safeParse("audit:web.unknown").success).toBe(false);
  });
});
