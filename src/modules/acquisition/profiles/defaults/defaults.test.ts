import { describe, expect, it } from "vitest";

import { ServiceLineProfileSchema } from "@/contracts/service-line-profile";

import { validateProfile, hasErrors } from "../validate";
import { DEFAULT_PROFILES } from ".";

describe("default profiles", () => {
  for (const [line, profile] of Object.entries(DEFAULT_PROFILES)) {
    describe(line, () => {
      it("parses with the contract schema", () => {
        const parsed = ServiceLineProfileSchema.safeParse(profile);
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      });

      it("has no validation errors (warnings allowed)", () => {
        const issues = validateProfile(profile);
        const errors = issues.filter((i) => i.severity === "error");
        expect(errors, JSON.stringify(errors)).toHaveLength(0);
        expect(hasErrors(issues)).toBe(false);
      });

      it("marks pricing as needsReview until Prince confirms", () => {
        expect(profile.pricing.needsReview).toBe(true);
      });

      it("has one default sequence per market", () => {
        expect(profile.sequences.NIGERIA.filter((s) => s.isDefault)).toHaveLength(1);
        expect(profile.sequences.INTERNATIONAL.filter((s) => s.isDefault)).toHaveLength(1);
      });

      it("declares between 3 and 5 pitch angles per market", () => {
        expect(profile.pitchAngles.NIGERIA.length).toBeGreaterThanOrEqual(3);
        expect(profile.pitchAngles.NIGERIA.length).toBeLessThanOrEqual(5);
        expect(profile.pitchAngles.INTERNATIONAL.length).toBeGreaterThanOrEqual(3);
        expect(profile.pitchAngles.INTERNATIONAL.length).toBeLessThanOrEqual(5);
      });
    });
  }
});
