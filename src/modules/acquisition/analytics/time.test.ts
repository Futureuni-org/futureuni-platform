import { describe, expect, it } from "vitest";

import {
  dayKey,
  previousPeriod,
  recipientTimezone,
  resolveRange,
  startOfMonth,
  weekdayHour,
  zonedWallToUtc,
} from "./time";

describe("dayKey (platform timezone bucketing, INV-12)", () => {
  it("buckets a 23:30 UTC instant on the next day in Lagos (AC-38.3)", () => {
    // Lagos is UTC+1, so 23:30Z is 00:30 the next civil day.
    expect(dayKey(new Date("2026-10-02T23:30:00Z"))).toBe("2026-10-03");
  });

  it("keeps a daytime UTC instant on the same Lagos day", () => {
    expect(dayKey(new Date("2026-10-02T10:00:00Z"))).toBe("2026-10-02");
  });

  it("buckets in an explicit timezone when asked", () => {
    expect(dayKey(new Date("2026-10-02T23:30:00Z"), "UTC")).toBe("2026-10-02");
  });
});

describe("resolveRange", () => {
  const now = new Date("2026-10-03T09:00:00Z");

  it("rolling presets end at now", () => {
    const r = resolveRange({ preset: "7d" }, now);
    expect(r.to).toEqual(now);
    expect(r.from).toEqual(new Date("2026-09-26T09:00:00Z"));
  });

  it("year to date starts at the Lagos new year (UTC-1 of midnight)", () => {
    const r = resolveRange({ preset: "ytd" }, now);
    expect(r.from.toISOString()).toBe("2025-12-31T23:00:00.000Z"); // 2026-01-01 00:00 Lagos
    expect(r.to).toEqual(now);
  });

  it("quarter to date starts at the quarter boundary in Lagos", () => {
    const r = resolveRange({ preset: "qtd" }, now); // Oct → Q4 starts 1 Oct
    expect(r.from.toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });

  it("passes custom from/to through", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-02-01T00:00:00Z");
    expect(resolveRange({ preset: "custom", from, to }, now)).toEqual({ from, to });
  });
});

describe("previousPeriod", () => {
  it("is the equal-length window ending where the current one begins", () => {
    const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-11T00:00:00Z") };
    const prev = previousPeriod(range);
    expect(prev.to).toEqual(range.from);
    expect(prev.from).toEqual(new Date("2026-09-21T00:00:00Z"));
    expect(prev.to.getTime() - prev.from.getTime()).toBe(range.to.getTime() - range.from.getTime());
  });
});

describe("recipientTimezone", () => {
  it("maps known countries and falls back to the market default", () => {
    expect(recipientTimezone("NIGERIA", null)).toBe("Africa/Lagos");
    expect(recipientTimezone("INTERNATIONAL", "GB")).toBe("Europe/London");
    expect(recipientTimezone("INTERNATIONAL", "US")).toBe("America/New_York");
    expect(recipientTimezone("INTERNATIONAL", null)).toBe("UTC");
    expect(recipientTimezone("INTERNATIONAL", "ZZ")).toBe("UTC"); // unknown country
    expect(recipientTimezone("NIGERIA", "NG")).toBe("Africa/Lagos");
  });
});

describe("weekdayHour (recipient-local heatmap cell)", () => {
  it("reads the weekday and hour in the given timezone", () => {
    // 2026-10-02 is a Friday. 23:30Z in Lagos is Saturday 00:30.
    expect(weekdayHour(new Date("2026-10-02T12:00:00Z"), "Africa/Lagos")).toEqual({ weekday: 5, hour: 13 });
    expect(weekdayHour(new Date("2026-10-02T23:30:00Z"), "Africa/Lagos")).toEqual({ weekday: 6, hour: 0 });
  });
});

describe("zonedWallToUtc and startOfMonth", () => {
  it("round-trips a Lagos wall-clock time to the right UTC instant", () => {
    const utc = zonedWallToUtc(
      { year: 2026, month: 10, day: 3, hour: 0, minute: 0, second: 0 },
      "Africa/Lagos",
    );
    expect(utc.toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });

  it("finds the start of the Lagos month", () => {
    expect(startOfMonth(new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });
});
