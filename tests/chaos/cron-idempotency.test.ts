/**
 * Phase 20 chaos (Step 6): a cron tick delivered twice must run each job once. The dispatcher keys
 * every enqueue by the 5-minute slot (`<job>:<slotIso>`), so two ticks in the same slot collapse to
 * one JobRun (INV-22). These are the pure slot + due-schedule units behind that guarantee.
 */

import { describe, expect, it } from "vitest";

import { isScheduleDue, slotIso } from "@/platform/jobs/dispatcher";

const LAGOS = "Africa/Lagos";

describe("slot idempotency key", () => {
  it("floors to the 5-minute slot, so two ticks in the same slot share a key", () => {
    const a = slotIso(new Date("2026-10-05T08:01:10Z"));
    const b = slotIso(new Date("2026-10-05T08:04:59Z"));
    expect(a).toBe(b); // same slot → same `<job>:<slot>` key → one JobRun
    expect(a).toBe("2026-10-05T08:00:00.000Z");
  });

  it("advances to a new key in the next slot", () => {
    const a = slotIso(new Date("2026-10-05T08:04:59Z"));
    const b = slotIso(new Date("2026-10-05T08:05:00Z"));
    expect(a).not.toBe(b);
    expect(b).toBe("2026-10-05T08:05:00.000Z");
  });
});

describe("schedule due-ness within a slot", () => {
  it("a */5 schedule is due in every slot", () => {
    expect(isScheduleDue({ cron: "*/5 * * * *", timezone: LAGOS }, new Date("2026-10-05T07:10:02Z"))).toBe(true);
  });

  it("a */30 schedule is due only in the :00 and :30 slots", () => {
    // 09:30 Lagos = 08:30 UTC.
    expect(isScheduleDue({ cron: "*/30 * * * *", timezone: LAGOS }, new Date("2026-10-05T08:31:00Z"))).toBe(true);
    expect(isScheduleDue({ cron: "*/30 * * * *", timezone: LAGOS }, new Date("2026-10-05T08:16:00Z"))).toBe(false);
  });

  it("a daily schedule is due only in the slot containing its time", () => {
    // 02:00 Lagos = 01:00 UTC.
    expect(isScheduleDue({ cron: "0 2 * * *", timezone: LAGOS }, new Date("2026-10-05T01:02:00Z"))).toBe(true);
    expect(isScheduleDue({ cron: "0 2 * * *", timezone: LAGOS }, new Date("2026-10-05T01:07:00Z"))).toBe(false);
  });
});
