"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/patterns/states";

import { EvidenceChip } from "./evidence-chip";
import type { FindingChipView } from "./view";

/**
 * The evidence used in the draft: findings as chips (cited ones first), with a screenshot lightbox.
 * Highlighting is coordinated with the draft through `activeFindingId`.
 */

export function EvidencePanel({
  findings,
  citedFindingIds,
  activeFindingId,
  onActiveFindingChange,
  timezone,
}: {
  findings: FindingChipView[];
  citedFindingIds: string[];
  activeFindingId: string | null;
  onActiveFindingChange: (id: string | null) => void;
  timezone: string;
}): React.ReactElement {
  const [image, setImage] = useState<string | null>(null);

  const cited = new Set(citedFindingIds);
  const ordered = [...findings].sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)));

  if (findings.length === 0) {
    return (
      <EmptyState
        title="No evidence yet"
        description="Findings appear here after the lead is audited."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((finding) => (
        <EvidenceChip
          key={finding.id}
          finding={finding}
          highlighted={activeFindingId === finding.id}
          timezone={timezone}
          onActivate={() => { onActiveFindingChange(finding.id); }}
          onDeactivate={() => { onActiveFindingChange(null); }}
          onOpenImage={setImage}
        />
      ))}

      <Dialog open={image !== null} onOpenChange={(open) => { if (!open) setImage(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Evidence screenshot</DialogTitle>
          {image !== null ? (
            <div
              role="img"
              aria-label="Evidence screenshot"
              style={{ backgroundImage: `url(${image})` }}
              className="h-[70vh] w-full rounded-md bg-contain bg-center bg-no-repeat"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
