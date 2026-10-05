/**
 * Phase 20 chaos (Step 6): AI provider resilience. The circuit breaker opens after repeated
 * failures and recovers; the retry helper retries 429 / 5xx / Anthropic overload (incl. 529-class
 * `overloaded_error`) with an injected clock, and gives up / fails fast correctly. Pure units — no
 * network, no real delay.
 */

import { describe, expect, it, beforeEach } from "vitest";

import {
  __resetBreakersForTests,
  assertClosed,
  recordFailure,
  recordSuccess,
} from "@/platform/ai/providers/circuit-breaker";
import { classify, withRetry } from "@/platform/ai/providers/retry";

const KIND = "anthropic";
const noSleep = (): Promise<void> => Promise.resolve();

/** A provider-style error: an Error carrying an HTTP `status`, like the Anthropic SDK's. */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${String(status)}`), { status });
}

describe("circuit breaker", () => {
  beforeEach(() => {
    __resetBreakersForTests();
  });

  it("stays closed below the failure threshold", () => {
    for (let i = 0; i < 4; i += 1) recordFailure(KIND, 1000);
    expect(() => {
      assertClosed(KIND, 1000);
    }).not.toThrow();
  });

  it("opens after 5 consecutive failures and blocks within the window", () => {
    for (let i = 0; i < 5; i += 1) recordFailure(KIND, 1000);
    expect(() => {
      assertClosed(KIND, 1000);
    }).toThrow();
    // Still open 59s later.
    expect(() => {
      assertClosed(KIND, 1000 + 59_000);
    }).toThrow();
  });

  it("admits one probe after the open window (half-open), and a success closes it", () => {
    for (let i = 0; i < 5; i += 1) recordFailure(KIND, 1000);
    // 60s+ later: the probe is admitted (no throw).
    expect(() => {
      assertClosed(KIND, 1000 + 60_001);
    }).not.toThrow();
    recordSuccess(KIND);
    expect(() => {
      assertClosed(KIND, 1000 + 120_000);
    }).not.toThrow();
  });
});

describe("retry classify", () => {
  it("treats 429, 5xx and overloaded_error as retryable", () => {
    expect(classify({ status: 429 })).not.toBeNull();
    expect(classify({ status: 503 })).not.toBeNull();
    expect(classify({ status: 529 })).not.toBeNull();
    expect(classify({ error: { type: "overloaded_error" } })).not.toBeNull();
  });

  it("does not retry client errors or plain errors", () => {
    expect(classify({ status: 400 })).toBeNull();
    expect(classify({ status: 422 })).toBeNull();
    expect(classify(new Error("boom"))).toBeNull();
    expect(classify(null)).toBeNull();
  });

  it("reads Retry-After seconds into ms", () => {
    expect(classify({ status: 429, headers: { "retry-after": "2" } })?.retryAfterMs).toBe(2000);
  });
});

describe("withRetry", () => {
  it("retries a transient failure then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts += 1;
        return attempts < 3 ? Promise.reject(httpError(429)) : Promise.resolve("ok");
      },
      { sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("gives up after maxAttempts on a persistent 5xx", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        () => {
          attempts += 1;
          return Promise.reject(httpError(503));
        },
        { maxAttempts: 4, sleep: noSleep },
      ),
    ).rejects.toBeDefined();
    expect(attempts).toBe(4);
  });

  it("fails fast on a non-retryable error (no retries)", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        () => {
          attempts += 1;
          return Promise.reject(httpError(400));
        },
        { sleep: noSleep },
      ),
    ).rejects.toBeDefined();
    expect(attempts).toBe(1);
  });
});
