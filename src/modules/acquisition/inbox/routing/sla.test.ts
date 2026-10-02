import { describe, expect, it } from "vitest";

import { computeSlaDueAt, isActionable, type WorkingPattern } from "./sla";

const lagos: WorkingPattern = {
  timezone: "Africa/Lagos",
  workingDays: [1, 2, 3, 4, 5],
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
};

describe("isActionable", () => {
  it("covers INTERESTED, QUESTION and objections only", () => {
    expect(isActionable("INTERESTED")).toBe(true);
    expect(isActionable("QUESTION")).toBe(true);
    expect(isActionable("OBJECTION_PRICE")).toBe(true);
    expect(isActionable("OBJECTION_OTHER")).toBe(true);
    expect(isActionable("NOT_NOW")).toBe(false);
    expect(isActionable("OUT_OF_OFFICE")).toBe(false);
  });
});

describe("computeSlaDueAt (business hours)", () => {
  it("adds hours within the same working day", () => {
    // Monday 2026-10-05 09:00 Lagos = 08:00Z. +4h -> 13:00 Lagos = 12:00Z.
    const due = computeSlaDueAt(new Date("2026-10-05T08:00:00Z"), 4, lagos);
    expect(due.toISOString()).toBe("2026-10-05T12:00:00.000Z");
  });

  it("carries remaining hours to the next working morning", () => {
    // Monday 16:00 Lagos = 15:00Z. 1h to 17:00, 3h left -> Tue 12:00 Lagos = 11:00Z.
    const due = computeSlaDueAt(new Date("2026-10-05T15:00:00Z"), 4, lagos);
    expect(due.toISOString()).toBe("2026-10-06T11:00:00.000Z");
  });

  it("skips the weekend", () => {
    // Friday 2026-10-09 16:00 Lagos = 15:00Z. 1h Fri, 3h Monday -> Mon 2026-10-12 12:00 Lagos = 11:00Z.
    const due = computeSlaDueAt(new Date("2026-10-09T15:00:00Z"), 4, lagos);
    expect(due.toISOString()).toBe("2026-10-12T11:00:00.000Z");
  });

  it("starts from the next working morning when the reply arrives overnight", () => {
    // Monday 03:00 Lagos = 02:00Z (before work). +2h -> Mon 11:00 Lagos = 10:00Z.
    const due = computeSlaDueAt(new Date("2026-10-05T02:00:00Z"), 2, lagos);
    expect(due.toISOString()).toBe("2026-10-05T10:00:00.000Z");
  });
});
