import { describe, expect, it } from "vitest";

import { webDevelopmentDefaultProfile } from "./defaults/web-development";
import { validateProfile } from "./validate";

// Helper: clone deeply, mutate, validate.
function mutate<T>(base: T, fn: (draft: T) => void): T {
  const copy = JSON.parse(JSON.stringify(base)) as T;
  fn(copy);
  return copy;
}

describe("validateProfile", () => {
  it("accepts the web-development default", () => {
    const issues = validateProfile(webDevelopmentDefaultProfile);
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("rejects an unknown adapter id in sources", () => {
    const bad = mutate(webDevelopmentDefaultProfile, (p) => {
      const first = p.sources[0];
      if (first !== undefined) (first.adapterId as string) = "not-a-real-adapter";
    });
    const issues = validateProfile(bad);
    // Zod's SourceAdapterIdSchema (enum) will catch this first as a schema error.
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("rejects a scoring rule referencing an unknown signal", () => {
    const bad = mutate(webDevelopmentDefaultProfile, (p) => {
      p.scoring.rules.push({
        id: "made_up",
        label: "Broken rule",
        condition: { all: [{ kind: "signal", signalId: "does_not_exist", negate: false }] },
        points: 5,
      });
    });
    const issues = validateProfile(bad);
    expect(
      issues.some(
        (i) =>
          i.severity === "error" &&
          i.code === "UNKNOWN_SIGNAL" &&
          i.path.includes("scoring") &&
          i.path.includes("rules"),
      ),
    ).toBe(true);
  });

  it("rejects a pitch angle referencing an unknown signal", () => {
    const bad = mutate(webDevelopmentDefaultProfile, (p) => {
      const angle = p.pitchAngles.NIGERIA[0];
      if (angle !== undefined) angle.whenToUse.signals.push("nope_signal");
    });
    const issues = validateProfile(bad);
    expect(issues.some((i) => i.code === "UNKNOWN_SIGNAL")).toBe(true);
  });

  it("rejects a sequence step referencing an unknown pitch angle", () => {
    const bad = mutate(webDevelopmentDefaultProfile, (p) => {
      const step = p.sequences.NIGERIA[0]?.steps[0];
      if (step !== undefined) step.pitchAngleId = "not_declared";
    });
    const issues = validateProfile(bad);
    expect(issues.some((i) => i.code === "UNKNOWN_ANGLE")).toBe(true);
  });

  it("rejects a wrong currency for a market", () => {
    const bad = mutate(webDevelopmentDefaultProfile, (p) => {
      const price = p.pricing.packages[0]?.prices[0];
      if (price !== undefined) {
        price.currency = "USD";
        price.market = "NIGERIA";
      }
    });
    const issues = validateProfile(bad);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("emits a needsReview warning when pricing is marked so", () => {
    const issues = validateProfile(webDevelopmentDefaultProfile);
    expect(issues.some((i) => i.code === "PRICING_NEEDS_REVIEW")).toBe(true);
  });

  it("emits ALL_PLACEHOLDERS warning when every portfolio item is a placeholder", () => {
    const issues = validateProfile(webDevelopmentDefaultProfile);
    expect(issues.some((i) => i.code === "ALL_PLACEHOLDERS")).toBe(true);
  });
});
