"use client";

import { Play, CalendarClock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui";
import type { ServiceLine } from "@/contracts/common";

import { CostEstimate } from "./cost-estimate";
import { SpecFields, validateDraft } from "./spec-fields";
import { estimateCostAction } from "./actions";
import { toSearchSpec, type SearchDraft, type SourceOption } from "./types";
import type { SearchCostEstimate } from "@/modules/acquisition/sourcing";

/**
 * The search panel: the shared spec fields plus a live cost estimate, with Run now and Save as
 * scheduled search. A focused tool, not a form on a card. Validation is inline and Run shows a
 * pending state.
 */

const ESTIMATE_DEBOUNCE_MS = 500;

export function SearchPanel({
  slug,
  line,
  canRun,
  canSave,
  sourceOptions,
  initialDraft,
  running,
  onRun,
  onSaveAsScheduled,
}: {
  slug: string;
  line: ServiceLine;
  canRun: boolean;
  canSave: boolean;
  sourceOptions: SourceOption[];
  initialDraft: SearchDraft;
  running: boolean;
  onRun: (spec: Record<string, unknown>) => void;
  onSaveAsScheduled: (draft: SearchDraft) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<SearchDraft>(initialDraft);
  const [estimate, setEstimate] = useState<SearchCostEstimate | null>(null);
  const [capMicros, setCapMicros] = useState(5_000_000);
  const [estimating, setEstimating] = useState(false);

  const spec = useMemo(() => toSearchSpec(line, draft), [line, draft]);
  const validationError = useMemo(() => validateDraft(draft), [draft]);
  const canSubmit = validationError === null;

  const specKey = JSON.stringify(spec);
  const latestRequest = useRef(0);
  useEffect(() => {
    if (!canRun || !canSubmit) {
      // Don't fetch while invalid; the stale estimate is hidden in render instead.
      return;
    }
    const requestId = ++latestRequest.current;
    const timer = window.setTimeout(() => {
      setEstimating(true);
      void estimateCostAction(slug, spec).then((res) => {
        if (requestId !== latestRequest.current) return;
        setEstimating(false);
        if (res.ok) {
          setEstimate(res.data.estimate);
          setCapMicros(res.data.capMicros);
        } else {
          setEstimate(null);
        }
      });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [specKey, canRun, canSubmit, slug, spec]);

  function patch(next: Partial<SearchDraft>): void {
    setDraft((d) => ({ ...d, ...next }));
  }

  return (
    <div className="flex flex-col gap-6">
      <SpecFields draft={draft} onChange={patch} sourceOptions={sourceOptions} />

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        {canRun ? (
          <CostEstimate estimate={canSubmit ? estimate : null} capMicros={capMicros} loading={estimating && canSubmit} />
        ) : null}
        {validationError !== null ? (
          <p className="text-sm text-danger" role="alert">
            {validationError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {canRun ? (
            <Button
              onClick={() => {
                onRun(spec);
              }}
              disabled={!canSubmit || running}
            >
              <Play className="size-4" aria-hidden />
              {running ? "Searching…" : "Run now"}
            </Button>
          ) : (
            <p className="text-sm text-muted">
              You can view runs, but only leads and managers run searches.
            </p>
          )}
          {canSave ? (
            <Button
              variant="secondary"
              onClick={() => {
                onSaveAsScheduled(draft);
              }}
              disabled={!canSubmit}
            >
              <CalendarClock className="size-4" aria-hidden />
              Save as scheduled search
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
