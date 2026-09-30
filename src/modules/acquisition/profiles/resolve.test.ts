import { describe, expect, it } from "vitest";

import { webDevelopmentDefaultProfile } from "./defaults/web-development";
import {
  resolvePitchAngle,
  resolvePortfolio,
  selectAcquisitionReferences,
} from "./resolve";

describe("resolvePitchAngle", () => {
  it("ranks angles by signal + finding overlap", () => {
    const ranked = resolvePitchAngle(webDevelopmentDefaultProfile, "NIGERIA", {
      signals: ["slow_mobile"],
      findings: [{ checkId: "web.pagespeed_mobile" }],
    });
    // Every angle is included; the first should be the "faster_pages" one that names
    // both slow_mobile and web.pagespeed_mobile in whenToUse.
    expect(ranked[0]?.angle.id).toBe("faster_pages");
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });

  it("keeps declaration order for ties", () => {
    const ranked = resolvePitchAngle(webDevelopmentDefaultProfile, "NIGERIA", {
      signals: [],
      findings: [],
    });
    // Everything has score 0; ranked stays in declaration order.
    const originalOrder = webDevelopmentDefaultProfile.pitchAngles.NIGERIA.map((a) => a.id);
    expect(ranked.map((r) => r.angle.id)).toStrictEqual(originalOrder);
  });
});

describe("resolvePortfolio", () => {
  it("never returns a placeholder", () => {
    const items = resolvePortfolio(webDevelopmentDefaultProfile, "NIGERIA", []);
    // All items in the default are placeholders; result should be empty.
    expect(items).toStrictEqual([]);
  });
});

describe("selectAcquisitionReferences", () => {
  it("returns the exact ordered path list for M7-AC7 (WEB_DEVELOPMENT, both)", () => {
    const paths = selectAcquisitionReferences({
      serviceLine: "WEB_DEVELOPMENT",
      market: "both",
    });
    expect(paths.map((p) => p.path)).toStrictEqual([
      "acquisition/_references/services-catalogue.md",
      "acquisition/_references/evidence-rules.md",
      "acquisition/_references/lines/web-development.md",
      "acquisition/_references/markets/nigeria.md",
      "acquisition/_references/markets/international.md",
    ]);
  });

  it("returns just the NG market file when market=NIGERIA", () => {
    const paths = selectAcquisitionReferences({
      serviceLine: "GRAPHIC_DESIGN",
      market: "NIGERIA",
    });
    expect(paths.at(-1)?.path).toBe("acquisition/_references/markets/nigeria.md");
    expect(paths).toHaveLength(4);
  });
});
