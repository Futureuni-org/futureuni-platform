import { describe, expect, it } from "vitest";

import { resolveFollowUpDate } from "./follow-up";

describe("resolveFollowUpDate", () => {
  it("places a future ISO date at local noon in the recipient's timezone", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const out = resolveFollowUpDate("2026-12-01", now, "Africa/Lagos", 90);
    // Lagos is UTC+1 all year, so noon local is 11:00 UTC.
    expect(out.toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });

  it("falls back to now + defaultDays when no date is given", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const out = resolveFollowUpDate(null, now, "Africa/Lagos", 90);
    expect(out.getTime()).toBe(now.getTime() + 90 * 86_400_000);
  });

  it("rolls a past date forward by the default horizon", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const out = resolveFollowUpDate("2026-09-01", now, "Africa/Lagos", 90);
    expect(out.getTime()).toBe(now.getTime() + 90 * 86_400_000);
  });

  it("ignores an unparseable date", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const out = resolveFollowUpDate("sometime soon", now, "Europe/London", 30);
    expect(out.getTime()).toBe(now.getTime() + 30 * 86_400_000);
  });
});
