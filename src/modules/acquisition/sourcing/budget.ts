/**
 * Per-run budget (Phase 8, source-adapter.md rule 9). Each adapter calls `tryCharge` before a paid
 * provider call and stops gracefully when it returns false. Two caps apply:
 *
 *  - the **run** caps (max provider calls, max estimated cost) shared across every adapter of the
 *    run — reason `RUN_BUDGET`;
 *  - each provider's **daily** allowance: the adapter's own per-day quota (`PROVIDER_QUOTA`) and the
 *    per-provider daily cost cap from settings (`DAILY_CAP`). Its remaining amount is snapshotted
 *    from `ProviderUsage` at run start (the limiter) and reconciled back after each adapter.
 *
 * `tryCharge` is synchronous (the contract fixes it), so it reserves against in-memory counters;
 * the runner persists the actual usage to `ProviderUsage` after each adapter. Parallel runs can
 * therefore overshoot a daily cap by at most one run's reservations — acceptable and documented.
 */

import type { ProviderId } from "@/contracts/common";
import type { SearchRunSourceResult } from "@/contracts/source-adapter";

export type CappedReason = NonNullable<SearchRunSourceResult["cappedReason"]>;

export interface RunCaps {
  maxCalls: number;
  maxCostMicros: number;
}

export interface ProviderDailyRemaining {
  /** Calls left today for the provider (adapter perDay quota minus used); null = no per-day quota. */
  calls: number | null;
  /** Micro-USD left today under the per-provider daily cost cap. */
  costMicros: number;
}

interface ProviderLedger {
  remaining: ProviderDailyRemaining;
  usedCalls: number;
  usedCostMicros: number;
  cappedReason: CappedReason | null;
}

/** The `SourceContext.budget` shape the adapter sees, bound to one provider. */
export interface BudgetView {
  tryCharge(calls: number, costMicros: number): boolean;
  remaining(): { calls: number; costMicros: number };
  /** The reason the last charge was refused, for the run's perSource record. */
  lastCappedReason(): CappedReason | null;
}

/** A provider's reconciled usage for one run, written to ProviderUsage after the adapter finishes. */
export interface ProviderRunUsage {
  provider: ProviderId;
  calls: number;
  costMicros: number;
  capHit: boolean;
}

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export class RunBudget {
  private runCalls = 0;
  private runCostMicros = 0;
  private readonly providers = new Map<ProviderId, ProviderLedger>();

  constructor(private readonly caps: RunCaps) {}

  /** Register a provider's remaining daily allowance (from the limiter's ProviderUsage snapshot). */
  registerProvider(provider: ProviderId, remaining: ProviderDailyRemaining): void {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, {
        remaining,
        usedCalls: 0,
        usedCostMicros: 0,
        cappedReason: null,
      });
    }
  }

  /** A budget view bound to `provider`. Charges count against both the run and the provider's day. */
  viewFor(provider: ProviderId | null): BudgetView {
    if (provider === null) return this.unmeteredView();
    const ledger = this.providers.get(provider) ?? {
      remaining: { calls: null, costMicros: UNLIMITED },
      usedCalls: 0,
      usedCostMicros: 0,
      cappedReason: null,
    };
    this.providers.set(provider, ledger);
    return {
      tryCharge: (calls, costMicros) => this.charge(ledger, calls, costMicros),
      remaining: () => this.viewRemaining(ledger),
      lastCappedReason: () => ledger.cappedReason,
    };
  }

  /** Providers with no credential (csv-import, manual, apple-app-store, feeds): never metered. */
  private unmeteredView(): BudgetView {
    return {
      tryCharge: (calls, costMicros) => {
        if (this.runCalls + calls > this.caps.maxCalls) return false;
        if (this.runCostMicros + costMicros > this.caps.maxCostMicros) return false;
        this.runCalls += calls;
        this.runCostMicros += costMicros;
        return true;
      },
      remaining: () => ({
        calls: this.caps.maxCalls - this.runCalls,
        costMicros: this.caps.maxCostMicros - this.runCostMicros,
      }),
      lastCappedReason: () => null,
    };
  }

  private charge(ledger: ProviderLedger, calls: number, costMicros: number): boolean {
    if (this.runCalls + calls > this.caps.maxCalls) {
      ledger.cappedReason = "RUN_BUDGET";
      return false;
    }
    if (this.runCostMicros + costMicros > this.caps.maxCostMicros) {
      ledger.cappedReason = "RUN_BUDGET";
      return false;
    }
    if (ledger.remaining.calls !== null && ledger.usedCalls + calls > ledger.remaining.calls) {
      ledger.cappedReason = "PROVIDER_QUOTA";
      return false;
    }
    if (ledger.usedCostMicros + costMicros > ledger.remaining.costMicros) {
      ledger.cappedReason = "DAILY_CAP";
      return false;
    }
    this.runCalls += calls;
    this.runCostMicros += costMicros;
    ledger.usedCalls += calls;
    ledger.usedCostMicros += costMicros;
    return true;
  }

  private viewRemaining(ledger: ProviderLedger): { calls: number; costMicros: number } {
    const runCalls = this.caps.maxCalls - this.runCalls;
    const runCost = this.caps.maxCostMicros - this.runCostMicros;
    const dailyCalls =
      ledger.remaining.calls === null ? runCalls : ledger.remaining.calls - ledger.usedCalls;
    const dailyCost = ledger.remaining.costMicros - ledger.usedCostMicros;
    return { calls: Math.max(0, Math.min(runCalls, dailyCalls)), costMicros: Math.max(0, Math.min(runCost, dailyCost)) };
  }

  /** Total provider calls charged so far, for the run's cost estimate. */
  totalCostMicros(): number {
    return this.runCostMicros;
  }

  /** Per-provider usage to persist to ProviderUsage after the run. */
  usage(): ProviderRunUsage[] {
    return [...this.providers.entries()].map(([provider, ledger]) => ({
      provider,
      calls: ledger.usedCalls,
      costMicros: ledger.usedCostMicros,
      capHit: ledger.cappedReason === "DAILY_CAP" || ledger.cappedReason === "PROVIDER_QUOTA",
    }));
  }
}
