import { describe, expect, it } from "vitest";

import { companyLabel, isPlacesPlaceholder } from "./company-label";

describe("companyLabel", () => {
  it("keeps a real stored name unchanged (non-Places source)", () => {
    expect(
      companyLabel({
        name: "Acme Ltd",
        firstSource: "apple-app-store",
        city: "London",
        industry: "tech",
      }),
    ).toBe("Acme Ltd");
  });

  it("keeps a google-places name that was already enriched to a real name", () => {
    expect(
      companyLabel({
        name: "Joe's Diner",
        firstSource: "google-places",
        city: "Lagos",
        industry: "restaurant",
      }),
    ).toBe("Joe's Diner");
  });

  it("composes industry + city for a Places placeholder", () => {
    expect(
      companyLabel({
        name: "Place S4Mopg",
        firstSource: "google-places",
        city: "London",
        industry: "restaurant",
      }),
    ).toBe("Restaurant · London");
  });

  it("title-cases underscored industry labels", () => {
    expect(
      companyLabel({
        name: "Place P-KaUw",
        firstSource: "google-places",
        city: "Abuja",
        industry: "beauty_salon",
      }),
    ).toBe("Beauty Salon · Abuja");
  });

  it("falls back to industry only, then city, then generic", () => {
    expect(
      companyLabel({
        name: "Place S4Mopg",
        firstSource: "google-places",
        city: null,
        industry: "real_estate_agency",
      }),
    ).toBe("Real Estate Agency");
    expect(
      companyLabel({
        name: "Place P-KaUw",
        firstSource: "google-places",
        city: "Abuja",
        industry: null,
      }),
    ).toBe("Business in Abuja");
    expect(
      companyLabel({
        name: "Place P-KaUw",
        firstSource: "google-places",
        city: null,
        industry: null,
      }),
    ).toBe("Unnamed business");
  });

  it("isPlacesPlaceholder only for the google-places placeholder shape", () => {
    expect(isPlacesPlaceholder("Place S4Mopg", "google-places")).toBe(true);
    expect(isPlacesPlaceholder("Place P-KaUw", "google-places")).toBe(true);
    expect(isPlacesPlaceholder("Place S4Mopg", "manual")).toBe(false);
    expect(isPlacesPlaceholder("Placeholder Inc", "google-places")).toBe(false);
    expect(isPlacesPlaceholder("Real Co Ltd", "google-places")).toBe(false);
  });
});
