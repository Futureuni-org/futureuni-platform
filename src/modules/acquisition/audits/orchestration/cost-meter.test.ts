import { describe, expect, it } from "vitest";

import { createCostMeter } from "./cost-meter";

describe("createCostMeter (per-lead cost cap)", () => {
  it("charges until the cap, then refuses", () => {
    const meter = createCostMeter(10_000);
    expect(meter.tryCharge(4_000, "capture")).toBe(true);
    expect(meter.tryCharge(5_000, "ai")).toBe(true);
    expect(meter.spentMicros()).toBe(9_000);
    expect(meter.tryCharge(2_000, "ai")).toBe(false); // would exceed 10_000
    expect(meter.tryCharge(1_000, "ai")).toBe(true); // still fits
    expect(meter.spentMicros()).toBe(10_000);
  });

  it("always allows zero-cost checks", () => {
    const meter = createCostMeter(0);
    expect(meter.tryCharge(0, "pagespeed")).toBe(true);
    expect(meter.tryCharge(1, "capture")).toBe(false);
  });
});
