import { describe, expect, it } from "vitest";

import { getCapabilities } from "./model-capabilities";

describe("getCapabilities", () => {
  // The live API returns 400 ("`temperature` is deprecated for this model") when a Claude 5
  // family model receives `temperature`/`top_p`. This broke every audit.uiux heuristics call
  // in production (2026-11-04); the table must never say these models accept sampling params.
  it.each([
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-1",
    "claude-opus-5",
    "claude-sonnet-5",
  ])("%s rejects temperature and top_p, accepts effort", (model) => {
    const caps = getCapabilities(model);
    expect(caps.acceptsTemperature).toBe(false);
    expect(caps.acceptsTopP).toBe(false);
    expect(caps.acceptsEffort).toBe(true);
  });

  it.each(["claude-haiku-4-5", "claude-haiku-4-5-20251001"])(
    "%s still accepts temperature",
    (model) => {
      const caps = getCapabilities(model);
      expect(caps.acceptsTemperature).toBe(true);
      expect(caps.acceptsEffort).toBe(false);
    },
  );

  it("falls back to sampling-only for unknown models", () => {
    const caps = getCapabilities("some-unknown-model");
    expect(caps.acceptsTemperature).toBe(true);
    expect(caps.acceptsEffort).toBe(false);
  });
});
