import { describe, expect, it } from "vitest";

import { allowedNumbers, checkInsightNumbers } from "./number-check";
import type { WeeklyInsightInput, WeeklyInsightOutput } from "./schema";

const INPUT: WeeklyInsightInput = {
  weekLabel: "week of 28 Sep 2026",
  previousWeekLabel: "week of 21 Sep 2026",
  cells: [
    {
      serviceLine: "WEB_DEVELOPMENT",
      market: "NIGERIA",
      metrics: [
        { id: "reply_rate", label: "Reply rate", current: "25%", previous: "20%", sampleSize: 40 },
        { id: "revenue", label: "Revenue", current: "₦500,000", previous: "₦400,000", sampleSize: 2 },
      ],
    },
  ],
};

describe("allowedNumbers", () => {
  it("collects every number the model may state", () => {
    const allowed = allowedNumbers(INPUT);
    expect(allowed.has("25%")).toBe(true);
    expect(allowed.has("20%")).toBe(true);
    expect(allowed.has("₦500000")).toBe(true); // grouping stripped
    expect(allowed.has("₦400000")).toBe(true);
    expect(allowed.has("40")).toBe(true); // sample size
    expect(allowed.has("2026")).toBe(true); // from the week label
  });
});

describe("checkInsightNumbers", () => {
  it("passes when every number restates an input value", () => {
    const output: WeeklyInsightOutput = {
      headline: "Web Development reply rate rose to 25% in Nigeria",
      points: [{ text: "Replies climbed from 20% to 25% across 40 contacted leads.", metricIds: ["reply_rate"] }],
      watchouts: [{ text: "Revenue of ₦500,000 came from only 2 deals, so read it with care.", metricIds: ["revenue"] }],
    };
    expect(checkInsightNumbers(output, INPUT).ok).toBe(true);
  });

  it("rejects an invented number (a computed delta the model wasn't given)", () => {
    const output: WeeklyInsightOutput = {
      headline: "Reply rate improved",
      points: [{ text: "Reply rate rose 5 points, a 25% relative gain.", metricIds: ["reply_rate"] }],
      watchouts: [],
    };
    // "5" and "25%" — 25% is allowed, but "5" (the invented point delta) is not.
    const result = checkInsightNumbers(output, INPUT);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContain("5");
  });

  it("rejects a reformatted money amount", () => {
    const output: WeeklyInsightOutput = {
      headline: "Revenue was ₦500,001 this week",
      points: [],
      watchouts: [],
    };
    const result = checkInsightNumbers(output, INPUT);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContain("₦500001");
  });

  it("allows prose with no numbers", () => {
    const output: WeeklyInsightOutput = {
      headline: "A quiet week across every line",
      points: [{ text: "Nothing moved enough to call out.", metricIds: [] }],
      watchouts: [],
    };
    expect(checkInsightNumbers(output, INPUT).ok).toBe(true);
  });
});
