import { describe, expect, it } from "vitest";

import { dailyCapForParams } from "./warmup";

const params = { warmupStartDate: "2026-10-01", warmupStartCap: 5, dailyCapTarget: 35, warmupRampDays: 24 };

describe("dailyCapForParams", () => {
  it("is the starting cap on day 0", () => {
    expect(dailyCapForParams(params, "2026-10-01")).toBe(5);
  });
  it("ramps linearly mid-way", () => {
    // day 12: 5 + floor(12 * 30 / 24) = 5 + 15 = 20
    expect(dailyCapForParams(params, "2026-10-13")).toBe(20);
  });
  it("reaches the target cap after the ramp", () => {
    expect(dailyCapForParams(params, "2026-11-10")).toBe(35);
  });
  it("never exceeds the target", () => {
    expect(dailyCapForParams(params, "2027-01-01")).toBe(35);
  });
  it("clamps a date before the start to the starting cap", () => {
    expect(dailyCapForParams(params, "2026-09-20")).toBe(5);
  });
  it("returns the target when it is at or below the starting cap", () => {
    expect(dailyCapForParams({ ...params, warmupStartCap: 40, dailyCapTarget: 35 }, "2026-10-15")).toBe(35);
  });
});
