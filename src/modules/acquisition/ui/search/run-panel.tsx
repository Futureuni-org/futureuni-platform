"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleSlash, Loader2, RotateCw, TriangleAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { MarketBadge } from "@/components/ui/market-badge";
import type { ServiceLine } from "@/contracts/common";
import type { SearchRunSourceResult } from "@/contracts/source-adapter";
import { lineHref } from "@/modules/acquisition/ui/shell/line-context";

import { cancelRunAction, getRunProgressAction, retrySourceAction } from "./actions";
import { Counter } from "./counter";
import { signalLabel, type RunProgress } from "./view";

/**
 * The live run panel: polls progress about every 2s while a run is active, shows each source's
 * status, animated counters, and the new leads as they arrive. A partial run offers "Retry this
 * source". Stops polling when the run ends.
 */

const POLL_MS = 2000;

interface Track {
  runId: string | null;
  jobRunId: string | null;
}

export function RunPanel({
  slug,
  line,
  initialRunId,
  initialJobRunId,
  canRun,
  onRunId,
}: {
  slug: string;
  line: ServiceLine;
  initialRunId: string | null;
  initialJobRunId: string | null;
  canRun: boolean;
  onRunId?: (runId: string) => void;
}): React.ReactElement {
  const [track, setTrack] = useState<Track>({ runId: initialRunId, jobRunId: initialJobRunId });
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const reportedRunId = useRef<string | null>(null);

  const poll = useCallback(async () => {
    const res = await getRunProgressAction(slug, {
      ...(track.runId === null ? {} : { runId: track.runId }),
      ...(track.jobRunId === null ? {} : { jobRunId: track.jobRunId }),
    });
    if (res.ok) {
      setProgress(res.data);
      if (res.data.runId !== null && track.runId === null) {
        setTrack((t) => ({ ...t, runId: res.data.runId }));
      }
      if (res.data.runId !== null && reportedRunId.current !== res.data.runId) {
        reportedRunId.current = res.data.runId;
        onRunId?.(res.data.runId);
      }
    }
    return res.ok ? res.data.finished : false;
  }, [slug, track.runId, track.jobRunId, onRunId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const loop = async (): Promise<void> => {
      const finished = await poll();
      if (!active || finished) return;
      timer = window.setTimeout(() => {
        void loop();
      }, POLL_MS);
    };
    void loop();

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [poll]);

  async function retry(adapterId: string): Promise<void> {
    if (track.runId === null) return;
    setRetrying(adapterId);
    const res = await retrySourceAction(slug, track.runId, adapterId);
    setRetrying(null);
    if (res.ok) {
      reportedRunId.current = null;
      setProgress(null);
      setTrack({ runId: null, jobRunId: res.data.jobRunId });
    }
  }

  async function cancel(): Promise<void> {
    if (track.runId === null) return;
    await cancelRunAction(slug, track.runId);
    void poll();
  }

  const counts = progress?.counts ?? null;
  const status = progress?.status ?? "QUEUED";
  const running = !(progress?.finished ?? false);

  return (
    <section
      aria-label="Search run"
      className="flex flex-col gap-5 rounded-lg bg-surface p-5 shadow-soft"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RunStatusIcon status={status} running={running} />
          <div>
            <p className="text-sm font-semibold text-heading">{runTitle(status, running)}</p>
            <p className="text-xs text-muted" aria-live="polite">
              {runSubtitle(progress)}
            </p>
          </div>
        </div>
        {running && track.runId !== null && canRun ? (
          <Button variant="ghost" size="sm" onClick={() => void cancel()}>
            Cancel
          </Button>
        ) : null}
      </header>

      {progress?.skipReason === "capacity" ? (
        <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <TriangleAlert className="size-4" aria-hidden />
          This run was skipped because the line is at capacity.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Fetched" value={counts?.fetched ?? 0} />
        <Stat label="New companies" value={counts?.companiesCreated ?? 0} />
        <Stat label="Matched" value={counts?.companiesMatched ?? 0} />
        <Stat label="Leads created" value={counts?.leadsCreated ?? 0} accent />
        <Stat label="Suppressed" value={counts?.suppressed ?? 0} />
        <Stat label="Out of market" value={counts?.outOfMarket ?? 0} />
      </dl>

      {(progress?.perSource.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Sources</p>
          <ul className="flex flex-col gap-1.5">
            {progress?.perSource.map((source) => (
              <SourceRow
                key={`${source.adapterId}-${source.market}`}
                source={source}
                canRetry={canRun && track.runId !== null}
                retrying={retrying === source.adapterId}
                onRetry={() => void retry(source.adapterId)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          New leads{progress !== null && progress.leads.length > 0 ? ` (${String(progress.leads.length)})` : ""}
        </p>
        {progress !== null && progress.leads.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {progress.leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={lineHref(line, `leads/${lead.id}`)}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-heading">{lead.companyName}</span>
                    <span className="truncate text-xs text-muted">
                      {signalLabel(lead.signalType) ?? "New lead"}
                      {lead.country !== null ? ` · ${lead.country}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <MarketBadge market={lead.market} />
                    {lead.score !== null ? (
                      <span className="font-mono text-xs tabular-nums text-muted">{lead.score}</span>
                    ) : null}
                    <ArrowRight className="size-4 text-subtle" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {running ? "Leads will appear here as they're created." : "No leads were created."}
          </p>
        )}
      </div>

      {progress !== null && progress.finished && progress.skipReason === null ? (
        <p className="rounded-md bg-primary-soft/40 px-3 py-2 text-sm text-foreground">
          {finishedSummary(progress)}
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <Counter
        value={value}
        className={[
          "font-mono text-2xl tabular-nums",
          accent === true ? "text-primary" : "text-heading",
        ].join(" ")}
      />
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function SourceRow({
  source,
  canRetry,
  retrying,
  onRetry,
}: {
  source: SearchRunSourceResult;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}): React.ReactElement {
  const failed = source.status === "FAILED";
  const capped = source.status === "CAPPED";
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 text-sm font-medium text-heading">
          {source.adapterId}
          <SourceStatusChip status={source.status} />
        </span>
        {source.error !== undefined ? (
          <span className="truncate text-xs text-danger">{source.error}</span>
        ) : (
          <span className="text-xs text-muted">
            {source.fetched.toLocaleString("en-GB")} fetched
          </span>
        )}
      </span>
      {(failed || capped) && canRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
          <RotateCw className="size-3.5" aria-hidden />
          {retrying ? "Retrying…" : "Retry this source"}
        </Button>
      ) : null}
    </li>
  );
}

const SOURCE_STATUS_STYLES: Record<SearchRunSourceResult["status"], string> = {
  QUEUED: "bg-zone text-muted",
  RUNNING: "bg-info-soft text-info",
  DONE: "bg-success-soft text-success",
  FAILED: "bg-danger-soft text-danger",
  CAPPED: "bg-warning-soft text-warning",
  SKIPPED: "bg-zone text-muted",
};

function SourceStatusChip({ status }: { status: SearchRunSourceResult["status"] }): React.ReactElement {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STATUS_STYLES[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function RunStatusIcon({ status, running }: { status: RunProgress["status"]; running: boolean }): React.ReactElement {
  if (running) return <Loader2 className="size-5 animate-spin text-primary" aria-hidden />;
  if (status === "SUCCEEDED") return <CheckCircle2 className="size-5 text-success" aria-hidden />;
  if (status === "PARTIAL") return <TriangleAlert className="size-5 text-warning" aria-hidden />;
  if (status === "FAILED") return <XCircle className="size-5 text-danger" aria-hidden />;
  return <CircleSlash className="size-5 text-muted" aria-hidden />;
}

function runTitle(status: RunProgress["status"], running: boolean): string {
  if (running) return "Searching…";
  switch (status) {
    case "SUCCEEDED":
      return "Search complete";
    case "PARTIAL":
      return "Search finished with some sources failing";
    case "FAILED":
      return "Search failed";
    case "CANCELLED":
      return "Search cancelled";
    case "SKIPPED":
      return "Search skipped";
    default:
      return "Search";
  }
}

function runSubtitle(progress: RunProgress | null): string {
  if (progress === null) return "Starting the run…";
  if (!progress.finished) return "Watching sources and counts update…";
  if (progress.error !== null) return progress.error;
  return "Done.";
}

function finishedSummary(progress: RunProgress): string {
  const created = progress.counts?.leadsCreated ?? 0;
  if (created === 0) {
    return "No new leads this time — try more keywords or another city.";
  }
  return `${String(created)} new ${created === 1 ? "lead is" : "leads are"} being enriched and audited. They'll appear in Review when drafts are ready.`;
}
