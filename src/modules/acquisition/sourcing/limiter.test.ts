import { describe, expect, it } from "vitest";

import { platformDay, TokenBucket } from "./limiter";

describe("TokenBucket", () => {
  it("allows a burst up to capacity, then paces at the rate", async () => {
    let now = 0;
    const waits: number[] = [];
    const bucket = new TokenBucket(2, {
      nowMs: () => now,
      sleep: (ms) => {
        waits.push(ms);
        now += ms; // the wait advances the clock, refilling the bucket
        return Promise.resolve();
      },
    });
    // Capacity is max(1, rate) = 2: two immediate acquisitions, no wait.
    await bucket.acquire();
    await bucket.acquire();
    expect(waits).toEqual([]);
    // The third must wait ~500ms (1 token at 2/sec).
    await bucket.acquire();
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1);
  });
});

describe("platformDay", () => {
  it("returns the UTC-midnight date of the Africa/Lagos calendar day", () => {
    // 23:30 UTC is already 00:30 the next day in Lagos (UTC+1).
    expect(platformDay(new Date("2026-10-03T23:30:00Z")).toISOString()).toBe(
      "2026-10-04T00:00:00.000Z",
    );
    // 10:00 UTC is the same calendar day in Lagos.
    expect(platformDay(new Date("2026-10-03T10:00:00Z")).toISOString()).toBe(
      "2026-10-03T00:00:00.000Z",
    );
  });
});
