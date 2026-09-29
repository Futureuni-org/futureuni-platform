import { describe, expect, it } from "vitest";

import { BATCH_DISCOUNT, buildUsage, computeCostMicros, getPricing, listKnownModels } from "./pricing";

describe("pricing", () => {
  it("knows the three tier defaults", () => {
    const models = listKnownModels();
    expect(models).toContain("claude-haiku-4-5");
    expect(models).toContain("claude-sonnet-5-5");
    expect(models).toContain("claude-opus-5-5");
  });

  it("Opus 5.5 is $4/$20 in micro-USD per token", () => {
    const p = getPricing("claude-opus-5-5");
    expect(p.inputPerToken).toBe(4);
    expect(p.outputPerToken).toBe(20);
  });

  it("Haiku 4.5 is $1/$5 in micro-USD per token", () => {
    const p = getPricing("claude-haiku-4-5");
    expect(p.inputPerToken).toBe(1);
    expect(p.outputPerToken).toBe(5);
  });

  it("throws on an unknown model", () => {
    expect(() => getPricing("no-such-model")).toThrow(/No pricing entry/);
  });

  it("computes a plain input+output bill", () => {
    // Sonnet 5.5: 1000 input * 2 + 500 output * 10 = 2000 + 5000 = 7000 μUSD
    const cost = computeCostMicros("claude-sonnet-5-5", {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
    });
    expect(cost).toBe(7000);
  });

  it("applies the cache-read multiplier", () => {
    // Opus 5.5 (input=4, cacheRead=0.05x): 100 cache-read tokens * 4 * 0.05 = 20 μUSD
    const cost = computeCostMicros("claude-opus-5-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 100,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
    });
    expect(cost).toBe(20);
  });

  it("applies the 5m and 1h cache-write multipliers", () => {
    // Haiku 4.5 (input=1): 100 * 1 * 1.25 (5m) + 100 * 1 * 2 (1h) = 125 + 200 = 325
    const cost = computeCostMicros("claude-haiku-4-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 100,
      cacheWrite1hTokens: 100,
    });
    expect(cost).toBe(325);
  });

  it("halves the bill for batch calls", () => {
    const tokens = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
    };
    const sync = computeCostMicros("claude-sonnet-5-5", tokens);
    const batch = computeCostMicros("claude-sonnet-5-5", tokens, { batch: true });
    expect(batch).toBe(Math.round(sync * BATCH_DISCOUNT));
  });

  it("buildUsage folds 5m and 1h cache writes into cacheWriteTokens", () => {
    const usage = buildUsage(
      "claude-sonnet-5-5",
      {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheWrite5mTokens: 20,
        cacheWrite1hTokens: 5,
      },
      1234,
    );
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.cacheReadTokens).toBe(10);
    expect(usage.cacheWriteTokens).toBe(25);
    expect(usage.latencyMs).toBe(1234);
    expect(usage.costMicros).toBeGreaterThan(0);
  });
});
