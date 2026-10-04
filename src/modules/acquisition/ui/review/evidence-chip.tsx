"use client";

import { ExternalLink, ImageIcon } from "lucide-react";

import { RelativeTime } from "@/components/ui/relative-time";

import { safeHttpUrl } from "./safe-url";
import type { FindingChipView } from "./view";

/**
 * One finding as an evidence chip: severity, the claim, how it was found (measured / observed /
 * AI-judged), a source link and capture date, with a screenshot thumbnail that opens a lightbox.
 * Hovering or focusing it highlights the citation in the draft (and the reverse).
 */

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "bg-danger-soft text-danger",
  HIGH: "bg-danger-soft text-danger",
  MEDIUM: "bg-warning-soft text-warning",
  LOW: "bg-info-soft text-info",
  INFO: "bg-zone text-muted",
};

const METHOD_LABEL: Record<string, string> = {
  MEASURED: "Measured",
  OBSERVED: "Observed",
  AI_JUDGED: "AI-judged",
};

export function EvidenceChip({
  finding,
  highlighted,
  timezone,
  onActivate,
  onDeactivate,
  onOpenImage,
}: {
  finding: FindingChipView;
  highlighted: boolean;
  timezone: string;
  onActivate: () => void;
  onDeactivate: () => void;
  onOpenImage: (url: string) => void;
}): React.ReactElement {
  const safeSource = safeHttpUrl(finding.sourceUrl);
  const safeArtifact = safeHttpUrl(finding.artifactUrl);
  return (
    <div
      id={`evidence-${finding.id}`}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      tabIndex={0}
      className={[
        "flex flex-col gap-2 rounded-md border p-3 outline-none transition-colors",
        highlighted ? "border-primary bg-primary-soft/40" : "border-border",
        finding.dismissed ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[finding.severity] ?? "bg-zone text-muted"}`}>
          {finding.severity.charAt(0) + finding.severity.slice(1).toLowerCase()}
        </span>
        <span className="text-xs text-muted">{METHOD_LABEL[finding.method] ?? finding.method}</span>
        {finding.dismissed ? (
          <span className="rounded-full bg-zone px-2 py-0.5 text-xs text-muted">Dismissed</span>
        ) : null}
      </div>
      <p className="text-sm text-foreground">{finding.claim}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <RelativeTime value={new Date(finding.capturedAt)} timezone={timezone} />
        {safeSource !== null ? (
          <a
            href={safeSource}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden />
            Source
          </a>
        ) : null}
        {safeArtifact !== null ? (
          <button
            type="button"
            onClick={() => {
              onOpenImage(safeArtifact);
            }}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImageIcon className="size-3" aria-hidden />
            Screenshot
          </button>
        ) : null}
      </div>
    </div>
  );
}
