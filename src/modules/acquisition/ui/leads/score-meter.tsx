import type { ScoreBand } from "@/contracts/common";
import { cn } from "@/lib/cn";

/**
 * A compact score meter: a filled bar plus the numeric score and band label. Band is never shown by
 * colour alone (the number and the band word carry it too). Shared by the leads list, pipeline
 * cards and lead detail.
 */

const BAND_META: Record<ScoreBand, { label: string; fill: string; text: string }> = {
  QUALIFIED: { label: "Qualified", fill: "bg-success", text: "text-success" },
  BORDERLINE: { label: "Borderline", fill: "bg-warning", text: "text-warning" },
  BELOW: { label: "Below bar", fill: "bg-danger", text: "text-danger" },
};

export function ScoreMeter({
  score,
  band,
  showLabel = true,
  className,
}: {
  score: number | null;
  band: ScoreBand | null;
  showLabel?: boolean;
  className?: string;
}) {
  if (score === null) {
    return <span className="text-sm text-muted">Not scored</span>;
  }
  const meta = band === null ? null : BAND_META[band];
  const pct = Math.min(Math.max(score, 0), 100);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-zone"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Score ${String(score)} of 100${meta === null ? "" : `, ${meta.label}`}`}
      >
        <div
          className={cn("h-full rounded-full", meta?.fill ?? "bg-muted")}
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <span className="font-mono text-sm text-foreground tabular-nums">{score}</span>
      {showLabel && meta !== null && (
        <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
      )}
    </div>
  );
}
