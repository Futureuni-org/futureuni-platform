"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ServiceLine } from "@/contracts/common";

import { ManualAddSheet } from "./manual-add-sheet";
import { RunPanel } from "./run-panel";
import { SavedSearchForm, type SavedSearchFormValues } from "./saved-search-form";
import { SearchPanel } from "./search-panel";
import { REFRESH_BADGES_EVENT } from "@/modules/acquisition/ui/shell/line-context";
import { startSearchAction } from "./actions";
import type { SearchDraft, SourceOption } from "./types";

/**
 * Orchestrates the Search screen: the panel, the live run panel, the saved-search editor and the
 * manual-add sheet. The active run and the manual-add sheet live in the URL (`?run=`, `?add=1`) so
 * the view is shareable and survives refresh.
 */

interface ActiveRun {
  runId: string | null;
  jobRunId: string | null;
}

export function SearchWorkspace({
  slug,
  line,
  canRun,
  canSave,
  canManualAdd,
  sourceOptions,
  initialDraft,
  owners,
  initialRunId,
}: {
  slug: string;
  line: ServiceLine;
  canRun: boolean;
  canSave: boolean;
  canManualAdd: boolean;
  sourceOptions: SourceOption[];
  initialDraft: SearchDraft;
  owners: { id: string; name: string }[];
  initialRunId: string | null;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [active, setActive] = useState<ActiveRun | null>(
    initialRunId !== null ? { runId: initialRunId, jobRunId: null } : null,
  );
  const [starting, setStarting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<SearchDraft>(initialDraft);

  const addOpen = params.get("add") === "1";

  const setAdd = useCallback(
    (open: boolean) => {
      const next = new URLSearchParams(params.toString());
      if (open) next.set("add", "1");
      else next.delete("add");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const setRunParam = useCallback(
    (runId: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("run", runId);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  async function run(spec: Record<string, unknown>): Promise<void> {
    setStarting(true);
    const res = await startSearchAction(slug, spec);
    setStarting(false);
    if (res.ok) {
      setActive({ runId: null, jobRunId: res.data.jobRunId });
      // New leads will land in Review once drafted — nudge the badges.
      window.dispatchEvent(new Event(REFRESH_BADGES_EVENT));
    } else {
      toast.error(res.error.message);
    }
  }

  const runKey = active?.jobRunId ?? active?.runId ?? "none";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <SearchPanel
          slug={slug}
          line={line}
          canRun={canRun}
          canSave={canSave}
          sourceOptions={sourceOptions}
          initialDraft={initialDraft}
          running={starting}
          onRun={(spec) => void run(spec)}
          onSaveAsScheduled={(draft) => {
            setSaveDraft(draft);
            setSaveOpen(true);
          }}
        />
      </div>

      <div className="min-w-0">
        {active !== null ? (
          <RunPanel
            key={runKey}
            slug={slug}
            line={line}
            initialRunId={active.runId}
            initialJobRunId={active.jobRunId}
            canRun={canRun}
            onRunId={setRunParam}
          />
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
            <p className="max-w-xs text-sm text-muted">
              Set a market, location and keywords, then run a search to watch qualified businesses
              arrive here.
            </p>
          </div>
        )}
      </div>

      {canSave ? (
        <SavedSearchForm
          slug={slug}
          line={line}
          sourceOptions={sourceOptions}
          owners={owners}
          mode="create"
          initial={toFormValues(saveDraft, owners)}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSaved={() => {
            router.push(`/acquisition/${slug}/search/saved`);
          }}
        />
      ) : null}

      {canManualAdd ? (
        <ManualAddSheet slug={slug} line={line} open={addOpen} onOpenChange={setAdd} />
      ) : null}
    </div>
  );
}

function toFormValues(draft: SearchDraft, owners: { id: string; name: string }[]): SavedSearchFormValues {
  return {
    name: "",
    draft,
    cron: "0 9 * * 1-5",
    timezone: "Africa/Lagos",
    enabled: true,
    ownerId: owners[0]?.id ?? "",
  };
}
