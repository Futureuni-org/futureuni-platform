import { describe, expect, it } from "vitest";

import { claim, formatClaimDate } from "./templates";

const WHEN = new Date("2026-10-03T09:40:00Z");

describe("claim templates", () => {
  it("formats dates as '3 Oct 2026'", () => {
    expect(formatClaimDate(WHEN)).toBe("3 Oct 2026");
  });

  it("templates the pagespeed claim from the measured LCP", () => {
    expect(claim.pagespeed("mobile", 7_200, WHEN)).toBe(
      "Your homepage took 7.2s to show its main content on mobile in our test on 3 Oct 2026.",
    );
  });

  it("templates broken-links and viewport claims", () => {
    expect(claim.brokenLinks(3, 20, WHEN)).toContain("3 broken links out of the 20");
    expect(claim.viewport(WHEN)).toContain("no mobile viewport setting");
  });

  it("templates the video cadence and captions claims", () => {
    expect(claim.videoCadence(60, WHEN)).toContain("60 days");
    expect(claim.videoCaptions(2, 20, WHEN)).toContain("2 of your last 20 videos have captions");
  });

  it("keeps every claim within the contract length bounds (10..240)", () => {
    const samples = [
      claim.pagespeed("desktop", 5000, WHEN),
      claim.sslExpired(WHEN),
      claim.seoBasics(["a page title", "a search description"], WHEN),
      claim.noWebsite("an Instagram page", WHEN),
      claim.outdatedYear(2018, 8, WHEN),
    ];
    for (const s of samples) {
      expect(s.length).toBeGreaterThanOrEqual(10);
      expect(s.length).toBeLessThanOrEqual(240);
    }
  });
});
