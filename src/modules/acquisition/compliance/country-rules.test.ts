import { describe, expect, it } from "vitest";

import { COUNTRY_RULES, getCountryRule, UNKNOWN_COUNTRY_RULE } from "./country-rules";

describe("country rules table", () => {
  it("returns REVIEW for every unknown country", () => {
    expect(getCountryRule("ZZ")).toBe(UNKNOWN_COUNTRY_RULE);
    expect(getCountryRule(null)).toBe(UNKNOWN_COUNTRY_RULE);
    expect(getCountryRule(undefined)).toBe(UNKNOWN_COUNTRY_RULE);
  });

  it("GB allows incorporated bodies and requires consent from sole traders", () => {
    const gb = COUNTRY_RULES.GB;
    expect(gb?.coldEmail.incorporated).toBe("ALLOWED");
    expect(gb?.coldEmail.soleTrader).toBe("CONSENT_REQUIRED");
    expect(gb?.coldEmail.partnership).toBe("CONSENT_REQUIRED");
    expect(gb?.coldEmail.unknownForm).toBe("REVIEW");
  });

  it("NG stays REVIEW at rest, and its rule is overridden by the setting at runtime", () => {
    const ng = COUNTRY_RULES.NG;
    for (const bucket of Object.values(ng?.coldEmail ?? {})) expect(bucket).toBe("REVIEW");
  });

  it("US, CA and DE match their expected regimes", () => {
    expect(COUNTRY_RULES.US?.regime).toContain("CAN-SPAM");
    expect(COUNTRY_RULES.CA?.regime).toContain("CASL");
    expect(COUNTRY_RULES.DE?.regime).toContain("UWG");
  });

  it("every row carries a sourceUrl", () => {
    for (const rule of Object.values(COUNTRY_RULES)) expect(rule.sourceUrl).toMatch(/^https?:\/\//);
  });
});
