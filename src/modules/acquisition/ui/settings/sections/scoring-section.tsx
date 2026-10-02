"use client";

import { useEffect, useRef, useState } from "react";

import { SettingsSection } from "@/components/admin";
import { EmptyState, ErrorState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useDraft } from "../profile-draft-context";
import { LOW_SCORE_ACTIONS, type ScoringRule } from "../profile-types";
import { AddButton, ItemCard, NumberField, SelectField, TextField } from "../editor-fields";
import { ConditionBuilder } from "../condition-builder";
import { scorePreviewAction, type ScorePreviewRow } from "../actions";

const BAND_TONE: Record<string, "success" | "warning" | "neutral"> = {
  QUALIFIED: "success",
  BORDERLINE: "warning",
  BELOW: "neutral",
};

export function ScoringSection({ slug }: { slug: string }) {
  const { draft, canEdit, setField } = useDraft();
  const scoring = draft.scoring;
  const signalIds = draft.signals.map((s) => s.id);

  function setScoring(next: typeof scoring) {
    setField("scoring", next);
  }
  function setRules(next: ScoringRule[]) {
    setScoring({ ...scoring, rules: next });
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        eyebrow="Scoring"
        title="Scoring rules"
        description="Each matching rule adds its points. The score is clamped to 0–100."
        emphasized
        actions={
          canEdit ? (
            <AddButton
              label="Add rule"
              onClick={() => {
                let n = scoring.rules.length + 1;
                const existing = new Set(scoring.rules.map((r) => r.id));
                while (existing.has(`rule_${String(n)}`)) n += 1;
                const firstSignal = signalIds[0];
                setRules([
                  ...scoring.rules,
                  {
                    id: `rule_${String(n)}`,
                    label: "New rule",
                    points: 10,
                    condition: {
                      all: [
                        firstSignal !== undefined
                          ? { kind: "signal", signalId: firstSignal, negate: false }
                          : { kind: "field", field: "company.hasWebsite", op: "eq", value: false },
                      ],
                    },
                  },
                ]);
              }}
            />
          ) : undefined
        }
      >
        {scoring.rules.length === 0 ? (
          <EmptyState title="No rules yet" description="Add at least one scoring rule." />
        ) : (
          <div className="flex flex-col gap-4">
            {scoring.rules.map((rule, i) => {
              function patch(change: Partial<ScoringRule>) {
                setRules(scoring.rules.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
              }
              return (
                <ItemCard
                  key={i}
                  title={rule.label || rule.id}
                  badge={
                    <span
                      className={cn(
                        "font-mono text-xs",
                        rule.points >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {rule.points >= 0 ? "+" : ""}
                      {rule.points}
                    </span>
                  }
                  canEdit={canEdit}
                  onRemove={() => {
                    setRules(scoring.rules.filter((_, idx) => idx !== i));
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                    <TextField
                      label="Label"
                      description="Shown in score reasons."
                      value={rule.label}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({ label: v });
                      }}
                    />
                    <NumberField
                      label="Points"
                      value={rule.points}
                      min={-50}
                      max={50}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({ points: v ?? 0 });
                      }}
                    />
                  </div>
                  <ConditionBuilder
                    condition={rule.condition}
                    signalIds={signalIds}
                    disabled={!canEdit}
                    onChange={(condition) => {
                      patch({ condition });
                    }}
                  />
                </ItemCard>
              );
            })}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        eyebrow="Thresholds"
        title="Qualify, borderline and below"
        description="Leads at or above the qualify score go to outreach; the borderline band goes to review; below is handled by the low-score action."
      >
        <BandScale min={scoring.borderlineBand.min} max={scoring.borderlineBand.max} />
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <NumberField
            label="Borderline from"
            value={scoring.borderlineBand.min}
            min={0}
            max={100}
            disabled={!canEdit}
            onChange={(v) => {
              const min = Math.min(v ?? 0, scoring.borderlineBand.max);
              setScoring({ ...scoring, borderlineBand: { ...scoring.borderlineBand, min } });
            }}
          />
          <NumberField
            label="Borderline to"
            value={scoring.borderlineBand.max}
            min={0}
            max={99}
            disabled={!canEdit}
            onChange={(v) => {
              const max = Math.max(v ?? 0, scoring.borderlineBand.min);
              setScoring({
                ...scoring,
                borderlineBand: { ...scoring.borderlineBand, max },
                qualifyThreshold: max + 1,
              });
            }}
          />
        </div>
        <p className="text-sm text-muted">
          Qualify at <span className="font-mono text-foreground">{scoring.qualifyThreshold}</span>{" "}
          and above.
        </p>
        <SelectField
          label="Below-band action"
          value={scoring.lowScoreAction}
          disabled={!canEdit}
          options={[...LOW_SCORE_ACTIONS]}
          onChange={(v) => {
            setScoring({ ...scoring, lowScoreAction: v as typeof scoring.lowScoreAction });
          }}
        />
      </SettingsSection>

      <SettingsSection
        eyebrow="Live preview"
        title="How the draft rules score real leads"
        description="A sample of this line's scored leads, re-scored with the draft rules."
      >
        <ScorePreview slug={slug} scoring={scoring} />
      </SettingsSection>
    </div>
  );
}

function BandScale({ min, max }: { min: number; max: number }) {
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-md" aria-hidden>
        <div className="bg-zone" style={{ width: `${String(min)}%` }} />
        <div className="bg-warning-soft" style={{ width: `${String(max - min)}%` }} />
        <div className="bg-success-soft" style={{ width: `${String(100 - max)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>Below (0–{min - 1 < 0 ? 0 : min - 1})</span>
        <span>Borderline ({min}–{max})</span>
        <span>Qualified ({max + 1}–100)</span>
      </div>
    </div>
  );
}

function ScorePreview({ slug, scoring }: { slug: string; scoring: unknown }) {
  const [rows, setRows] = useState<ScorePreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoringJson = JSON.stringify(scoring);

  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        const result = await scorePreviewAction(slug, JSON.parse(scoringJson) as unknown);
        if (result.ok) {
          setRows(result.data);
        } else {
          setError(result.error.message);
        }
        setLoading(false);
      })();
    }, 500);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [slug, scoringJson]);

  if (error !== null) {
    return <ErrorState title="Preview unavailable" description={error} />;
  }
  if (loading && rows === null) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (rows !== null && rows.length === 0) {
    return (
      <EmptyState
        title="No scored leads to preview"
        description="Once this line has scored leads, they'll appear here with their draft scores."
      />
    );
  }

  return (
    <div aria-busy={loading} className={cn("flex flex-col gap-2", loading && "opacity-60")}>
      {(rows ?? []).map((row) => {
        const delta = row.currentScore === null ? null : row.draftScore - row.currentScore;
        return (
          <details key={row.leadId} className="rounded-md bg-zone px-4 py-3">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
              <span className="font-medium text-foreground">{row.companyName}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-muted">
                  was{" "}
                  <span className="font-mono text-foreground">{row.currentScore ?? "—"}</span>
                </span>
                <span aria-hidden>→</span>
                <span className="font-mono text-foreground">{row.draftScore}</span>
                {delta !== null && delta !== 0 && (
                  <span className={cn("font-mono text-xs", delta > 0 ? "text-success" : "text-danger")}>
                    ({delta > 0 ? "+" : ""}
                    {delta})
                  </span>
                )}
                <Badge tone={BAND_TONE[row.draftBand] ?? "neutral"}>{row.draftBand}</Badge>
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {row.draftReasons.length === 0 ? (
                <li className="text-muted">No rules matched.</li>
              ) : (
                row.draftReasons.map((r) => (
                  <li key={r.ruleId} className="flex items-center justify-between gap-2">
                    <span className="text-foreground">{r.label}</span>
                    <span
                      className={cn(
                        "font-mono text-xs",
                        r.points >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {r.points >= 0 ? "+" : ""}
                      {r.points}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
