import { describe, expect, it } from "vitest";

import { deriveCountry, deriveMarket, marketForCountry } from "./market";

describe("market and country derivation (module spec §3.4, source-adapter.md rule 5)", () => {
  it("prefers the explicit country over everything else", () => {
    expect(deriveCountry({ country: "ng" })).toBe("NG");
    expect(deriveCountry({ country: "GB", phone: "+2348031234567" })).toBe("GB");
  });

  it("derives NG from a Nigerian phone number", () => {
    expect(deriveCountry({ phone: "+2348031234567" })).toBe("NG");
    expect(deriveCountry({ phone: "0803 123 4567" })).toBeNull(); // no country code, no default
  });

  it("derives GB and US from their phone country codes", () => {
    expect(deriveCountry({ phone: "+442079460000" })).toBe("GB");
    expect(deriveCountry({ phone: "+12125550100" })).toBe("US");
  });

  it("derives the country from the address when there's no phone", () => {
    expect(deriveCountry({ addressCountry: "US" })).toBe("US");
  });

  it("derives the country from a ccTLD domain as a last resort", () => {
    expect(deriveCountry({ domain: "example.com.ng" })).toBe("NG");
    expect(deriveCountry({ domain: "studio.co.uk" })).toBe("GB");
    expect(deriveCountry({ domain: "shop.ie" })).toBe("IE");
    expect(deriveCountry({ domain: "example.com" })).toBeNull(); // generic TLD says nothing
  });

  it("returns null when nothing determines a country", () => {
    expect(deriveCountry({})).toBeNull();
    expect(deriveCountry({ country: "not-a-country" })).toBeNull();
  });

  it("maps NG to NIGERIA and everything else to INTERNATIONAL", () => {
    expect(marketForCountry("NG")).toBe("NIGERIA");
    expect(marketForCountry("GB")).toBe("INTERNATIONAL");
    expect(marketForCountry("US")).toBe("INTERNATIONAL");
  });

  it("falls back to the adapter's market when no country can be derived", () => {
    expect(deriveMarket({}, "NIGERIA")).toEqual({ country: null, market: "NIGERIA" });
    expect(deriveMarket({}, "INTERNATIONAL")).toEqual({ country: null, market: "INTERNATIONAL" });
  });

  it("derives the market from the country even when it contradicts the fallback", () => {
    // A GB result found during a NIGERIA search is INTERNATIONAL (the runner then drops it).
    expect(deriveMarket({ phone: "+442079460000" }, "NIGERIA")).toEqual({
      country: "GB",
      market: "INTERNATIONAL",
    });
    expect(deriveMarket({ country: "NG" }, "INTERNATIONAL")).toEqual({
      country: "NG",
      market: "NIGERIA",
    });
  });
});
