import type { ScoreReasonView } from "./view";

/**
 * The lead score as a meter with an expandable list of reasons (condition → points). Colour is
 * paired with the band label, never colour alone. Local to acquisition UI; a promote candidate.
 */

function bandTone(band: string | null): { bar: string; label: string; text: string } {
  switch (band) {
    case "QUALIFIED":
      return { bar: "bg-success", label: "Qualified", text: "text-success" };
    case "BORDERLINE":
      return { bar: "bg-warning", label: "Borderline", text: "text-warning" };
    case "BELOW":
      return { bar: "bg-danger", label: "Below threshold", text: "text-danger" };
    default:
      return { bar: "bg-muted", label: "Not scored", text: "text-muted" };
  }
}

export function ScoreMeter({
  score,
  band,
  reasons,
}: {
  score: number | null;
  band: string | null;
  reasons: ScoreReasonView[];
}): React.ReactElement {
  const tone = bandTone(band);
  const pct = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold ${tone.text}`}>{tone.label}</span>
        <span className="font-mono text-lg tabular-nums text-heading">{score ?? "—"}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zone"
        role="meter"
        aria-valuenow={score ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Score ${String(score ?? 0)} of 100, ${tone.label}`}
      >
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${String(pct)}%` }} />
      </div>
      {reasons.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer select-none text-muted hover:text-foreground">
            Why this score ({reasons.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {reasons.map((reason) => (
              <li key={reason.ruleId} className="flex items-center justify-between gap-3">
                <span className="text-foreground">{reason.label}</span>
                <span
                  className={`font-mono text-xs tabular-nums ${reason.points >= 0 ? "text-success" : "text-danger"}`}
                >
                  {reason.points >= 0 ? "+" : ""}
                  {reason.points}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
