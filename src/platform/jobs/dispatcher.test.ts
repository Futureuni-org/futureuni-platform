import { describe, expect, it } from "vitest";

import { isScheduleDue, mostRecentDueSlot, slotIso } from "./dispatcher";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("cron dispatcher slot math", () => {
  it("floors to a 5-minute boundary", () => {
    const now = new Date("2026-09-29T14:07:33Z");
    expect(slotIso(now)).toBe("2026-09-29T14:05:00.000Z");
  });

  it("marks an every-5-minutes schedule as due at :00, :05, :10", () => {
    const schedule = { cron: "*/5 * * * *", timezone: "UTC" };
    expect(isScheduleDue(schedule, new Date("2026-09-29T14:05:00Z"))).toBe(true);
    expect(isScheduleDue(schedule, new Date("2026-09-29T14:06:15Z"))).toBe(true);
    expect(isScheduleDue(schedule, new Date("2026-09-29T14:04:59Z"))).toBe(true); // 14:00 slot still 5min
  });

  it("Africa/Lagos daily 08:00 = 07:00 UTC", () => {
    const schedule = { cron: "0 8 * * *", timezone: "Africa/Lagos" };
    expect(isScheduleDue(schedule, new Date("2026-09-29T07:00:00Z"))).toBe(true);
    expect(isScheduleDue(schedule, new Date("2026-09-29T07:04:59Z"))).toBe(true);
    expect(isScheduleDue(schedule, new Date("2026-09-29T07:05:00Z"))).toBe(false);
  });

  it("London daily 09:00 respects DST — 08:00 UTC in summer, 09:00 UTC in winter", () => {
    const schedule = { cron: "0 9 * * *", timezone: "Europe/London" };
    // 2026-06-15 is BST (UTC+1), so 09:00 London = 08:00 UTC.
    expect(isScheduleDue(schedule, new Date("2026-06-15T08:00:00Z"))).toBe(true);
    // 2026-12-15 is GMT, so 09:00 London = 09:00 UTC.
    expect(isScheduleDue(schedule, new Date("2026-12-15T09:00:00Z"))).toBe(true);
  });
});

describe("cron dispatcher catch-up (mostRecentDueSlot)", () => {
  it("returns the current slot for an every-5-minutes schedule (no behaviour change)", () => {
    const s = { cron: "*/5 * * * *", timezone: "UTC" };
    expect(mostRecentDueSlot(s, new Date("2026-10-27T11:17:20Z"), DAY_MS)).toBe(
      "2026-10-27T11:15:00.000Z",
    );
  });

  it("catches up a daily 09:00 Lagos slot whose tick was missed hours earlier", () => {
    const s = { cron: "0 9 * * 1-5", timezone: "Africa/Lagos" }; // 08:00 UTC on weekdays
    // Tuesday 11:17 UTC: no tick landed at 08:00 UTC, but the slot is still returned.
    expect(mostRecentDueSlot(s, new Date("2026-10-27T11:17:20Z"), DAY_MS)).toBe(
      "2026-10-27T08:00:00.000Z",
    );
  });

  it("returns null when the last fire is older than the lookback window", () => {
    const s = { cron: "0 9 * * 1-5", timezone: "Africa/Lagos" };
    // Sunday noon: the last weekday fire was Friday 08:00 UTC, more than 24h earlier.
    expect(mostRecentDueSlot(s, new Date("2026-11-01T12:00:00Z"), DAY_MS)).toBeNull();
  });

  it("never backfills more than the most recent slot for a frequent job", () => {
    const s = { cron: "*/5 * * * *", timezone: "UTC" };
    // Even a tiny lookback resolves to the current slot, never a run per missed slot.
    expect(mostRecentDueSlot(s, new Date("2026-10-27T11:17:20Z"), 5 * 60 * 1000)).toBe(
      "2026-10-27T11:15:00.000Z",
    );
  });
});
