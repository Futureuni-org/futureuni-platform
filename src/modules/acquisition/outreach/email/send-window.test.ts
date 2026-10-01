import { describe, expect, it } from "vitest";

import { addBusinessDays, buildSendWindow, nextSendSlot, resolveRecipientTimezone } from "./send-window";

const lagos = buildSendWindow({ timezone: "Africa/Lagos", start: "09:00", end: "17:00", jitterMinutes: 0 });

describe("resolveRecipientTimezone", () => {
  it("maps Nigeria to Africa/Lagos", () => {
    expect(resolveRecipientTimezone({ country: "NG", city: "Lagos", region: null })).toBe("Africa/Lagos");
  });
  it("maps single-zone countries to their zone", () => {
    expect(resolveRecipientTimezone({ country: "GB", city: null, region: null })).toBe("Europe/London");
  });
  it("maps a multi-zone country by city, else the capital", () => {
    expect(resolveRecipientTimezone({ country: "US", city: "Los Angeles", region: null })).toBe("America/Los_Angeles");
    expect(resolveRecipientTimezone({ country: "US", city: "Nowhere", region: null })).toBe("America/New_York");
  });
  it("falls back to UTC for unknown countries", () => {
    expect(resolveRecipientTimezone({ country: "ZZ", city: null, region: null })).toBe("Etc/UTC");
  });
});

describe("nextSendSlot", () => {
  it("returns the same instant when already inside the window", () => {
    const now = new Date("2026-10-05T12:00:00.000Z"); // 13:00 in Lagos, a weekday midday
    const slot = nextSendSlot(lagos, now, () => 0);
    expect(slot.getTime()).toBe(now.getTime());
  });

  it("moves a before-window time to the window start the same day (08:00Z = 09:00 Lagos)", () => {
    const now = new Date("2026-10-05T06:00:00.000Z"); // 07:00 Lagos
    const slot = nextSendSlot(lagos, now, () => 0);
    expect(slot.getTime()).toBeGreaterThan(now.getTime());
    expect(slot.getUTCHours()).toBe(8);
    expect(slot.getUTCDate()).toBe(now.getUTCDate());
  });

  it("moves an after-window time to the next weekday's window start", () => {
    const now = new Date("2026-10-05T20:00:00.000Z"); // 21:00 Lagos
    const slot = nextSendSlot(lagos, now, () => 0);
    expect(slot.getTime()).toBeGreaterThan(now.getTime());
    expect(slot.getUTCHours()).toBe(8);
    expect([1, 2, 3, 4, 5]).toContain(slot.getUTCDay());
  });

  it("never schedules on a weekend", () => {
    // 2026-10-10 is a Saturday.
    const sat = new Date("2026-10-10T06:00:00.000Z");
    const slot = nextSendSlot(lagos, sat, () => 0);
    expect([1, 2, 3, 4, 5]).toContain(slot.getUTCDay());
  });

  it("applies jitter within the configured minutes", () => {
    const withJitter = buildSendWindow({ timezone: "Africa/Lagos", start: "09:00", end: "17:00", jitterMinutes: 20 });
    const now = new Date("2026-10-05T06:00:00.000Z");
    const slot = nextSendSlot(withJitter, now, () => 0.5); // 50% of 21 minutes = 10 minutes
    expect(slot.getUTCHours()).toBe(8);
    expect(slot.getUTCMinutes()).toBe(10);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // 2026-10-09 is a Friday.
    const fri = new Date("2026-10-09T10:00:00.000Z");
    const next = addBusinessDays("Africa/Lagos", fri, 1);
    expect(next.getUTCDay()).toBe(1); // Monday
  });
  it("counts whole business days across a weekend", () => {
    const fri = new Date("2026-10-09T10:00:00.000Z");
    const five = addBusinessDays("Africa/Lagos", fri, 5);
    expect([1, 2, 3, 4, 5]).toContain(five.getUTCDay());
    expect(five.getTime() - fri.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000);
  });
  it("returns the same instant for zero days", () => {
    const d = new Date("2026-10-06T10:00:00.000Z");
    expect(addBusinessDays("Africa/Lagos", d, 0).getTime()).toBe(d.getTime());
  });
});
