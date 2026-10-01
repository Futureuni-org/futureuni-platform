import { describe, expect, it } from "vitest";

import { mockPageSpeed } from "./pagespeed/mock";
import { mockYouTubeChannel } from "./youtube/mock";
import { mockAppStoreReviews } from "./app-store/mock";
import { parseIsoDuration } from "./youtube/real";
import { summarise } from "./app-store/index";

describe("pagespeed mock", () => {
  it("is deterministic and reports a poor score for a slow site", () => {
    const a = mockPageSpeed("https://slow.example/", "mobile");
    const b = mockPageSpeed("https://slow.example/", "mobile");
    expect({ ...a, fetchedAt: "" }).toEqual({ ...b, fetchedAt: "" });
    expect(a.lcpMs).toBeGreaterThan(4_000);
    expect(a.reportUrl).toContain("pagespeed.web.dev");
  });
  it("reports a good score for a fast site", () => {
    const r = mockPageSpeed("https://fast.example/", "mobile");
    expect(r.performanceScore).toBeGreaterThanOrEqual(90);
    expect(r.lcpMs).toBeLessThan(4_000);
  });
});

describe("youtube mock", () => {
  it("produces a gone-quiet channel for a 'quiet' ref", () => {
    const ch = mockYouTubeChannel("https://youtube.com/@quiet-co", 20);
    const latest = Math.max(...ch.videos.map((v) => Date.parse(v.publishedAt)));
    const daysSince = (Date.now() - latest) / 86_400_000;
    expect(daysSince).toBeGreaterThan(45);
  });
  it("produces a recent cadence for an 'active' ref", () => {
    const ch = mockYouTubeChannel("https://youtube.com/@active-co", 20);
    const latest = Math.max(...ch.videos.map((v) => Date.parse(v.publishedAt)));
    expect((Date.now() - latest) / 86_400_000).toBeLessThan(14);
  });
});

describe("youtube parseIsoDuration", () => {
  it("parses ISO 8601 durations to seconds", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3_723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT10M")).toBe(600);
  });
});

describe("app-store mock", () => {
  it("skews negative for a 'buggy' app and the distribution sums to the review count", () => {
    const reviews = mockAppStoreReviews("buggy-app", "us");
    expect((reviews.averageRating ?? 5)).toBeLessThan(3);
    const total = Object.values(reviews.ratingDistribution).reduce((s, n) => s + n, 0);
    expect(total).toBe(reviews.reviews.length);
  });
  it("summarise computes an average and distribution", () => {
    const s = summarise([
      { id: "r1", rating: 5, title: "", text: "", updatedAt: "2026-10-01T00:00:00Z" },
      { id: "r2", rating: 1, title: "", text: "", updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(s.averageRating).toBe(3);
    expect(s.ratingDistribution["5"]).toBe(1);
    expect(s.ratingDistribution["1"]).toBe(1);
  });
});
