import { describe, expect, it } from "vitest";

import { isScheduleDue, slotIso } from "./dispatcher";

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
