"use client";

import { ChartFrame } from "@/components/charts";
import { cn } from "@/lib/cn";

import { formatCount, formatPercent } from "../format";
import type { FunnelResult, FunnelStage } from "@/modules/acquisition/analytics";

/**
 * Cohort funnel (Phase 17): one horizontal bar per stage, its width proportional to the cohort,
 * with the conversion from the previous stage. Focusing or hovering a bar shows the count and
 * drop-off. Can show Nigeria and International side by side. Wrapped in `ChartFrame` for the
 * screen-reader summary and the data-table fallback.
 */
export function FunnelChart({ data, showMarkets }: { data: FunnelResult; showMarkets?: boolean }) {
  const cohort = data.cohortSize || 1;
  const columns = ["Stage", "Count", "Conversion", "Drop-off"];
  const rows = data.stages.map((s) => [
    s.label,
    s.count,
    s.conversionFromPrevious === null ? "—" : formatPercent(s.conversionFromPrevious),
    s.dropOff === null ? "—" : String(s.dropOff),
  ]);

  return (
    <ChartFrame
      title="Cohort funnel"
      summary={`${formatCount(data.cohortSize)} leads created in this period, followed from found to won.`}
      columns={columns}
      rows={rows}
      height={data.stages.length * 44}
      empty={data.cohortSize === 0}
      // The per-market breakdown goes in the footer, not the chart box: the box has a fixed,
      // clipped height sized for the main stage list, and the breakdown's own height depends
      // on the viewport (it stacks one-column on phones). Inside the box it painted over the
      // section that follows.
      footer={
        showMarkets === true ? (
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.byMarket.map((m) => (
              <div key={m.market} className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted">
                  {m.market === "NIGERIA" ? "Nigeria" : "International"}
                </p>
                {m.stages.map((stage) => (
                  <StageBar
                    key={stage.key}
                    stage={stage}
                    cohort={Math.max(1, m.stages[0]?.count ?? 0)}
                    compact
                  />
                ))}
              </div>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="flex h-full flex-col justify-between gap-1">
        {data.stages.map((stage) => (
          <StageBar key={stage.key} stage={stage} cohort={cohort} />
        ))}
      </div>
    </ChartFrame>
  );
}

function StageBar({
  stage,
  cohort,
  compact,
}: {
  stage: FunnelStage;
  cohort: number;
  compact?: boolean;
}) {
  const widthPct = Math.max(2, Math.round((stage.count / cohort) * 100));
  const title =
    stage.dropOff === null
      ? `${stage.label}: ${formatCount(stage.count)}`
      : `${stage.label}: ${formatCount(stage.count)} (${formatPercent(stage.conversionFromPrevious)} of previous, ${formatCount(stage.dropOff)} dropped off)`;
  return (
    <div className="flex items-center gap-3" title={title} tabIndex={0}>
      <span className={cn("shrink-0 text-xs text-muted", compact ? "w-16" : "w-20")}>{stage.label}</span>
      <div className="relative h-5 flex-1 rounded-sm bg-zone">
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ width: `${String(widthPct)}%`, backgroundColor: "var(--primary)" }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
        {formatCount(stage.count)}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
        {stage.conversionFromPrevious === null ? "" : formatPercent(stage.conversionFromPrevious)}
      </span>
    </div>
  );
}
