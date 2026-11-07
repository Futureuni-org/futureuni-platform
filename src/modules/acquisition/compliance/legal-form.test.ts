import { describe, expect, it } from "vitest";

import { nameSimilarity } from "./legal-form";

// Real production misses (2026-11-07): these trading names failed to match their Companies House
// titles, leaving legalForm UNKNOWN and every outreach approval blocked by the INV-6 review hold.
describe("nameSimilarity", () => {
  it("matches a trading name against its registered title with an apostrophe", () => {
    expect(nameSimilarity("Papa Johns GB", "PAPA JOHN'S (GB) LIMITED")).toBeGreaterThanOrEqual(0.6);
  });

  it("ignores (UK) country markers in registered titles", () => {
    expect(
      nameSimilarity("Starbucks Coffee Company", "STARBUCKS COFFEE COMPANY (UK) LIMITED"),
    ).toBeGreaterThanOrEqual(0.6);
  });

  it("matches when only the legal suffix differs", () => {
    expect(nameSimilarity("Nectar 360 Ltd", "NECTAR 360 LIMITED")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("Plum Fintech Limited", "PLUM FINTECH LIMITED")).toBe(1);
  });

  it("stays low for unrelated companies", () => {
    expect(nameSimilarity("Papa Johns GB", "DOMINO'S PIZZA GROUP PLC")).toBeLessThan(0.6);
  });
});
