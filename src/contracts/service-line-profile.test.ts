import { describe, expect, it } from "vitest";

import videoProfile from "./fixtures/video-editing-profile.json";
import {
  ConditionSchema,
  PriceRangeSchema,
  ScoringSchema,
  ServiceLineProfileSchema,
  SignalDefinitionSchema,
} from "./service-line-profile";
import { issuePaths } from "./test-helpers";

/** docs/contracts/service-line-profile.md §4, extracted verbatim. */
const valid = videoProfile;

describe("service-line-profile contract", () => {
  it("parses the worked example (§4, the abridged Video Editing profile)", () => {
    const profile = ServiceLineProfileSchema.parse(valid);
    expect(profile.id).toBe("VIDEO_EDITING");
    expect(profile.sequences.NIGERIA[0]?.isDefault).toBe(true);
  });

  it("rejects the invalid example (§5): auto-send without a score, and USD for Nigeria", () => {
    const modified = structuredClone(valid);
    modified.approvalMode = "AUTO_SEND_ABOVE_SCORE";
    const nigeriaPrice = modified.pricing.packages[0]?.prices[0];
    if (nigeriaPrice === undefined) throw new Error("fixture changed");
    nigeriaPrice.currency = "USD";
    const result = ServiceLineProfileSchema.safeParse(modified);
    expect(issuePaths(result)).toEqual(
      expect.arrayContaining(["pricing.packages.0.prices.0", "autoSendMinScore"]),
    );
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Currency doesn't suit the market",
          "Required when approvalMode is AUTO_SEND_ABOVE_SCORE",
        ]),
      );
    }
  });

  it("requires exactly one default sequence per market", () => {
    const modified = structuredClone(valid);
    const sequence = modified.sequences.INTERNATIONAL[0];
    if (sequence === undefined) throw new Error("fixture changed");
    sequence.isDefault = false;
    expect(issuePaths(ServiceLineProfileSchema.safeParse(modified))).toContain(
      "sequences.INTERNATIONAL",
    );
  });

  it("keeps the threshold just above the borderline band", () => {
    const scoring = {
      rules: [
        {
          id: "rule_one",
          label: "Rule",
          condition: { all: [{ kind: "signal", signalId: "no_website" }] },
          points: 10,
        },
      ],
      qualifyThreshold: 70,
      borderlineBand: { min: 40, max: 60 },
    };
    expect(issuePaths(ScoringSchema.safeParse(scoring))).toEqual(["qualifyThreshold"]);
  });

  it("reserves manual_lead and orders price ranges", () => {
    expect(
      SignalDefinitionSchema.safeParse({
        id: "manual_lead",
        label: "Manual",
        description: "",
        weight: 0,
        markets: ["NIGERIA"],
        evidenceRequired: "",
      }).success,
    ).toBe(false);
    expect(
      PriceRangeSchema.safeParse({
        market: "NIGERIA",
        currency: "NGN",
        minMinor: 10,
        typicalMinor: 5,
        maxMinor: 20,
      }).success,
    ).toBe(false);
  });

  it("limits a condition to five atoms", () => {
    const atom = { kind: "signal", signalId: "no_website" };
    expect(ConditionSchema.safeParse({ all: Array.from({ length: 6 }, () => atom) }).success).toBe(
      false,
    );
  });
});
