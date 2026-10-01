import { describe, expect, it } from "vitest";

import { RunBudget } from "./budget";

describe("RunBudget (source-adapter.md rule 9)", () => {
  it("stops at the run's provider-call cap with reason RUN_BUDGET", () => {
    const budget = new RunBudget({ maxCalls: 2, maxCostMicros: 1_000_000 });
    budget.registerProvider("serpapi", { calls: 100, costMicros: 1_000_000 });
    const view = budget.viewFor("serpapi");
    expect(view.tryCharge(1, 10)).toBe(true);
    expect(view.tryCharge(1, 10)).toBe(true);
    expect(view.tryCharge(1, 10)).toBe(false);
    expect(view.lastCappedReason()).toBe("RUN_BUDGET");
  });

  it("stops at the run's cost cap with reason RUN_BUDGET", () => {
    const budget = new RunBudget({ maxCalls: 100, maxCostMicros: 50 });
    budget.registerProvider("serpapi", { calls: 100, costMicros: 1_000_000 });
    const view = budget.viewFor("serpapi");
    expect(view.tryCharge(1, 40)).toBe(true);
    expect(view.tryCharge(1, 20)).toBe(false);
    expect(view.lastCappedReason()).toBe("RUN_BUDGET");
  });

  it("stops at the provider's daily quota with reason PROVIDER_QUOTA", () => {
    const budget = new RunBudget({ maxCalls: 100, maxCostMicros: 1_000_000 });
    budget.registerProvider("youtube-data", { calls: 1, costMicros: 1_000_000 });
    const view = budget.viewFor("youtube-data");
    expect(view.tryCharge(1, 0)).toBe(true);
    expect(view.tryCharge(1, 0)).toBe(false);
    expect(view.lastCappedReason()).toBe("PROVIDER_QUOTA");
  });

  it("stops at the per-provider daily cost cap with reason DAILY_CAP", () => {
    const budget = new RunBudget({ maxCalls: 100, maxCostMicros: 1_000_000 });
    budget.registerProvider("google-places", { calls: null, costMicros: 30 });
    const view = budget.viewFor("google-places");
    expect(view.tryCharge(1, 20)).toBe(true);
    expect(view.tryCharge(1, 20)).toBe(false);
    expect(view.lastCappedReason()).toBe("DAILY_CAP");
  });

  it("reports remaining as the minimum of the run and daily allowances", () => {
    const budget = new RunBudget({ maxCalls: 10, maxCostMicros: 1_000 });
    budget.registerProvider("serpapi", { calls: 3, costMicros: 500 });
    const view = budget.viewFor("serpapi");
    view.tryCharge(1, 100);
    expect(view.remaining()).toEqual({ calls: 2, costMicros: 400 });
  });

  it("does not meter an adapter with no credential, but still enforces the run cap", () => {
    const budget = new RunBudget({ maxCalls: 1, maxCostMicros: 1_000 });
    const view = budget.viewFor(null);
    expect(view.tryCharge(1, 0)).toBe(true);
    expect(view.tryCharge(1, 0)).toBe(false);
    expect(view.lastCappedReason()).toBeNull();
  });

  it("reports per-provider usage for persistence", () => {
    const budget = new RunBudget({ maxCalls: 100, maxCostMicros: 1_000_000 });
    budget.registerProvider("serpapi", { calls: 100, costMicros: 1_000_000 });
    const view = budget.viewFor("serpapi");
    view.tryCharge(2, 50_000);
    expect(budget.usage()).toContainEqual({
      provider: "serpapi",
      calls: 2,
      costMicros: 50_000,
      capHit: false,
    });
  });
});
