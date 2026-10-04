"use client";

import { TriangleAlert } from "lucide-react";

import type { SearchCostEstimate } from "@/modules/acquisition/sourcing";

/**
 * The live cost estimate shown next to Run now: provider call count and an approximate USD cost
 * (internal micro-USD, never shown as client money). Warns when the estimate would pass the
 * per-run budget cap, which the run then stops at.
 */

const usd = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMicros(micros: number): string {
  return usd.format(micros / 1_000_000);
}

export function CostEstimate({
  estimate,
  capMicros,
  loading,
}: {
  estimate: SearchCostEstimate | null;
  capMicros: number;
  loading: boolean;
}): React.ReactElement {
  if (loading && estimate === null) {
    return <p className="text-sm text-muted">Estimating…</p>;
  }
  if (estimate === null) {
    return <p className="text-sm text-muted">Add a market and location to estimate the cost.</p>;
  }
  const overCap = estimate.totalCostMicros > capMicros;
  return (
    <div className="flex flex-col gap-1 text-sm" aria-live="polite">
      <p className="text-muted">
        <span className="font-mono tabular-nums text-foreground">
          {estimate.totalCalls.toLocaleString("en-GB")}
        </span>{" "}
        provider {estimate.totalCalls === 1 ? "call" : "calls"} · about{" "}
        <span className="font-mono tabular-nums text-foreground">
          {formatMicros(estimate.totalCostMicros)}
        </span>
      </p>
      {overCap ? (
        <p className="flex items-start gap-1.5 text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Over the {formatMicros(capMicros)} per-run cap — the run will stop once it reaches the
            cap.
          </span>
        </p>
      ) : null}
    </div>
  );
}
