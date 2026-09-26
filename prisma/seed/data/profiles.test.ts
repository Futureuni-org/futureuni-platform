import { describe, expect, it } from "vitest";

import { ServiceLineProfileSchema } from "@/contracts";

import { INITIAL_PROFILES } from "./profiles";

describe("seeded placeholder profiles (module spec §3.3)", () => {
  it.each(Object.entries(INITIAL_PROFILES))(
    "%s passes the ServiceLineProfile schema (INV-16)",
    (line, profile) => {
      const result = ServiceLineProfileSchema.safeParse(profile);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      expect(profile.id).toBe(line);
    },
  );

  it("marks every price as needing review and every portfolio item as a placeholder", () => {
    for (const profile of Object.values(INITIAL_PROFILES)) {
      expect(profile.pricing.needsReview).toBe(true);
      expect(profile.portfolio.every((item) => item.isPlaceholder)).toBe(true);
      expect(profile.pitchAngles.NIGERIA.length).toBeGreaterThanOrEqual(3);
      expect(profile.pitchAngles.INTERNATIONAL.length).toBeGreaterThanOrEqual(3);
    }
  });
});
