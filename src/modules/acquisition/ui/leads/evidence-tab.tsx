"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, RefreshCw } from "lucide-react";

import { ConfirmDialog } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/states";
import { cn } from "@/lib/cn";

import { dismissFindingAction, reauditAction } from "./detail-actions";
import type { DetailCapabilities, EvidenceAuditView, EvidenceFindingView } from "./detail-types";
import { MethodBadge, SeverityBadge } from "./evidence-chip";
import { EvidenceGallery } from "./evidence-gallery";
import { enumLabel, formatConfidence, formatDateTime } from "./format";
import { ToneBadge, type Tone } from "./tone-badge";

const AUDIT_TONE: Record<string, Tone> = {
  QUEUED: "info",
  RUNNING: "info",
  SUCCEEDED: "success",
  PARTIAL: "warning",
  FAILED: "danger",
  NOT_APPLICABLE: "neutral",
};

function agentLabel(agentId: string): string {
  return enumLabel(agentId.replace(/[.-]/g, "_"));
}

function Finding({
  finding,
  canDismiss,
  onDismiss,
}: {
  finding: EvidenceFindingView;
  canDismiss: boolean;
  onDismiss: (finding: EvidenceFindingView) => void;
}) {
  const dismissed = finding.dismissedAt !== null;
  return (
    // A dismissed finding is marked by its badge, the struck-through claim and the reason below.
    // It is not faded: lowering the opacity takes the text under the contrast it needs to be read.
    <article id={`finding-${finding.id}`} className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <MethodBadge method={finding.method} />
        <span className="text-xs text-muted">
          Confidence {formatConfidence(finding.confidence)}
        </span>
        {dismissed && (
          <ToneBadge tone="neutral" icon={Ban}>
            Dismissed
          </ToneBadge>
        )}
      </div>

      <p className={cn("max-w-prose break-words text-foreground", dismissed && "line-through")}>
        {finding.claim}
      </p>

      {dismissed && (
        <p className="text-sm text-muted">
          Dismissed{finding.dismissReason === null ? "" : `: ${finding.dismissReason}`}. It
          can&apos;t be cited in outreach.
        </p>
      )}

      {finding.metrics.length > 0 && (
        <table className="w-full max-w-md border-collapse text-sm">
          <caption className="sr-only">Measured values for this finding</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                Metric
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-medium">
                Value
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Threshold
              </th>
            </tr>
          </thead>
          <tbody>
            {finding.metrics.map((metric) => (
              <tr key={metric.key} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-1 pr-4 text-left font-normal text-foreground">
                  {metric.key}
                </th>
                <td className="py-1 pr-4 text-right font-mono text-foreground tabular-nums">
                  {metric.value}
                </td>
                <td className="py-1 text-right font-mono text-muted tabular-nums">
                  {metric.threshold ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {finding.observations.length > 0 && (
        <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-sm text-foreground">
          {finding.observations.map((observation) => (
            <li key={observation}>{observation}</li>
          ))}
        </ul>
      )}

      {finding.quotes.map((quote) => (
        <blockquote
          key={quote.text}
          className="max-w-prose border-l-2 border-border pl-3 text-sm text-muted"
        >
          {quote.text}
        </blockquote>
      ))}

      <EvidenceGallery artifacts={finding.artifacts} claim={finding.claim} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {finding.sourceUrl !== null && (
          <a
            href={finding.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            View source
          </a>
        )}
        {canDismiss && !dismissed && (
          <Button
            variant="ghost"
            onClick={() => {
              onDismiss(finding);
            }}
          >
            Dismiss finding
          </Button>
        )}
      </div>
    </article>
  );
}

/** The Evidence tab: every audit by agent, each finding with its measured evidence and screenshots. */
export function EvidenceTab({
  leadId,
  audits,
  capabilities,
  canRerun,
  timezone,
}: {
  leadId: string;
  audits: EvidenceAuditView[];
  capabilities: DetailCapabilities;
  /** The person may re-audit and the lead is in a status where a re-audit runs. */
  canRerun: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [rerunOpen, setRerunOpen] = useState(false);
  const [dismissing, setDismissing] = useState<EvidenceFindingView | null>(null);

  return (
    <div className="flex flex-col gap-10">
      {canRerun && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setRerunOpen(true);
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Re-run audits
          </Button>
        </div>
      )}

      {audits.length === 0 ? (
        <EmptyState
          title="No audits yet"
          description="Audits run after enrichment. Their findings and screenshots appear here."
        />
      ) : (
        audits.map((audit) => (
          <section
            key={audit.id}
            className="flex flex-col gap-6"
            aria-labelledby={`audit-${audit.id}`}
          >
            <header className="flex flex-col gap-2">
              <h2
                id={`audit-${audit.id}`}
                className="font-display text-2xl font-semibold text-heading"
              >
                {agentLabel(audit.agentId)}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                <ToneBadge tone={AUDIT_TONE[audit.status] ?? "neutral"}>
                  {enumLabel(audit.status)}
                </ToneBadge>
                {audit.finishedAt !== null && (
                  <span>Captured {formatDateTime(audit.finishedAt, timezone)}</span>
                )}
                {audit.costLabel !== null && (
                  <span>
                    Audit cost <span className="font-mono tabular-nums">{audit.costLabel}</span>
                  </span>
                )}
              </div>
            </header>

            {audit.findings.length === 0 ? (
              <p className="text-muted">This audit recorded no findings.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {audit.findings.map((finding) => (
                  <Finding
                    key={finding.id}
                    finding={finding}
                    canDismiss={capabilities.dismissFinding}
                    onDismiss={setDismissing}
                  />
                ))}
              </div>
            )}

            {audit.notAssessed.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Not assessed
                </h3>
                <ul className="flex max-w-prose flex-col gap-1 text-sm">
                  {audit.notAssessed.map((check) => (
                    <li key={check.checkId} className="text-foreground">
                      <span className="font-mono text-xs">{check.checkId}</span>
                      <span className="text-muted">
                        {" "}
                        · {enumLabel(check.status)}
                        {check.reason === null ? "" : `: ${check.reason}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))
      )}

      <ConfirmDialog
        open={rerunOpen}
        onOpenChange={setRerunOpen}
        title="Re-run this lead's audits?"
        description="Every audit runs again with fresh data. It can take a little while and may use provider credits."
        confirmLabel="Re-run audits"
        onConfirm={async () => {
          const result = await reauditAction(leadId);
          if (result.ok) {
            toast.success("Audits are running again.");
            router.refresh();
          }
          return result;
        }}
      />

      <ConfirmDialog
        open={dismissing !== null}
        onOpenChange={(open) => {
          if (!open) setDismissing(null);
        }}
        title="Dismiss this finding?"
        description={dismissing?.claim}
        body={
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            A dismissed finding can never be cited in outreach, replies or proposals.
          </p>
        }
        confirmLabel="Dismiss finding"
        tone="danger"
        requireReason
        reasonPlaceholder="Why is this finding wrong or not usable?"
        onConfirm={async (reason) => {
          if (dismissing === null) return { ok: true, data: null };
          const result = await dismissFindingAction(dismissing.id, reason);
          if (result.ok) {
            toast.success("Finding dismissed.");
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
