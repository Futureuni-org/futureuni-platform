/**
 * Rate limiting and daily quota snapshots for sourcing (Phase 8, source-adapter.md rule 9):
 *
 *  - an in-process **token bucket** per adapter, so bursts stay under the provider's per-second
 *    rate;
 *  - a **daily** snapshot per provider from `ProviderUsage` (the persisted counter shared by
 *    parallel runs and by Phases 9 and 10), used to seed the run's `RunBudget`.
 *
 * The day is the `Africa/Lagos` calendar day (the platform timezone, INV-12), matching how
 * `ProviderUsage.day` is written.
 */

import type { Clock } from "@/contracts/common";

import type { ProviderDailyRemaining } from "./budget";
import { readProviderUsage } from "./sourcing.repo";

const UNLIMITED_COST = Number.MAX_SAFE_INTEGER;

/** UTC-midnight Date for the Africa/Lagos calendar day of `at` (matches ProviderUsage.day). */
export function platformDay(at: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return new Date(`${parts}T00:00:00.000Z`);
}

export interface TokenBucketOptions {
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A refilling token bucket. `capacity` defaults to one second's worth of tokens (at least 1), so a
 * short burst is allowed and then smoothed to `ratePerSecond`. `now`/`sleep` are injectable for
 * deterministic tests.
 */
export class TokenBucket {
  private tokens: number;
  private lastMs: number;
  private readonly capacity: number;
  private readonly nowMs: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly ratePerSecond: number,
    options: TokenBucketOptions = {},
  ) {
    this.capacity = Math.max(1, ratePerSecond);
    this.tokens = this.capacity;
    this.nowMs = options.nowMs ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.lastMs = this.nowMs();
  }

  private refill(): void {
    const now = this.nowMs();
    const elapsedSeconds = Math.max(0, now - this.lastMs) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.ratePerSecond);
    this.lastMs = now;
  }

  /** Waits until a token is available, then consumes it. */
  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil((deficit / this.ratePerSecond) * 1000);
      await this.sleep(Math.max(1, waitMs));
    }
  }
}

/**
 * A provider's remaining daily allowance: calls left under the adapter's per-day quota (null when
 * the adapter declares none) and micro-USD left under the per-provider daily cost cap. Read from
 * the persisted `ProviderUsage` counter, so a run started later sees earlier runs' usage.
 */
export async function loadProviderDailyRemaining(
  provider: string,
  perDayQuota: number | null,
  dailyCostCapMicros: number,
  clock: Clock,
): Promise<ProviderDailyRemaining> {
  const usage = await readProviderUsage(provider, platformDay(clock.now()));
  const usedCalls = usage?.calls ?? 0;
  const usedCost = usage?.costMicros ?? 0;
  return {
    calls: perDayQuota === null ? null : Math.max(0, perDayQuota - usedCalls),
    costMicros: Math.max(0, (dailyCostCapMicros || UNLIMITED_COST) - usedCost),
  };
}
