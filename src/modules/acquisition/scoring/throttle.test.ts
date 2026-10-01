import { describe, expect, it } from "vitest";

import { computeThrottleMode, effectiveDailyCap, lagosDayRange, loadPercent } from "./throttle";

describe("computeThrottleMode — thresholds (AC-18.1)", () => {
  const t = { slowAtPercent: 70, pauseAtPercent: 100 };
  it("69 / 70 / 99 / 100 → NORMAL / SLOW / SLOW / PAUSED", () => {
    expect(computeThrottleMode(69, t)).toBe("NORMAL");
    expect(computeThrottleMode(70, t)).toBe("SLOW");
    expect(computeThrottleMode(99, t)).toBe("SLOW");
    expect(computeThrottleMode(100, t)).toBe("PAUSED");
  });
  it("no capacity reads as fully loaded (PAUSED)", () => {
    expect(computeThrottleMode(loadPercent(0, 0), t)).toBe("PAUSED");
    expect(computeThrottleMode(loadPercent(0, 5), t)).toBe("PAUSED");
  });
  it("loadPercent is load/capacity * 100", () => {
    expect(loadPercent(10, 7)).toBe(70);
    expect(loadPercent(8, 4)).toBe(50);
  });
});

describe("effectiveDailyCap", () => {
  it("NORMAL = full cap, SLOW = floor(cap * factor), PAUSED = 0", () => {
    expect(effectiveDailyCap("NORMAL", { dailyCap: 30, slowFactor: 0.3 })).toBe(30);
    expect(effectiveDailyCap("SLOW", { dailyCap: 30, slowFactor: 0.3 })).toBe(9);
    expect(effectiveDailyCap("PAUSED", { dailyCap: 30, slowFactor: 0.3 })).toBe(0);
  });
});

describe("lagosDayRange", () => {
  it("brackets the Africa/Lagos calendar day (UTC+1) around an instant", () => {
    // 2026-10-01T23:30:00Z is 2026-10-02 00:30 in Lagos → the Lagos day is Oct 2.
    const { start, end } = lagosDayRange(new Date("2026-10-01T23:30:00Z"));
    expect(start.toISOString()).toBe("2026-10-01T23:00:00.000Z"); // 2026-10-02T00:00+01:00
    expect(end.toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });
  it("is a 24-hour window", () => {
    const { start, end } = lagosDayRange(new Date("2026-06-15T09:00:00Z"));
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
