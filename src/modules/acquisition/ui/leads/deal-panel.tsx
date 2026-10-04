"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Download } from "lucide-react";

import { Select, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Section } from "@/components/patterns/section";
import type { ServiceLine } from "@/contracts/common";

import { DownloadLink } from "./button-link";
import { assignHandoffAction, exportHandoffAction } from "./detail-actions";
import type { DealView, DetailCapabilities, HandoffView } from "./detail-types";
import { formatDay, LOST_REASON_LABEL, SERVICE_LINE_LABEL } from "./format";
import { withPerson } from "./select-options";
import { ToneBadge } from "./tone-badge";

/**
 * The outcome of a closed lead. Won: the deal and its handoff record, with the suggested delivery
 * owner per service (a manager can change it) and an export. Lost: the reason and any
 * re-engagement date. Start and re-engagement dates have no time, so they show as plain days.
 */
export function DealPanel({
  deal,
  handoff,
  capabilities,
  teamByLine,
}: {
  deal: DealView;
  handoff: HandoffView | null;
  capabilities: DetailCapabilities;
  /** The team of each service on the deal: a delivery owner is chosen from that service's own team. */
  teamByLine: Partial<Record<ServiceLine, SelectOption[]>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  if (deal.outcome === "LOST") {
    return (
      <Section eyebrow="Outcome" title="Deal lost" variant="zone">
        <dl className="flex max-w-prose flex-col gap-2 text-sm">
          {deal.lostReason !== null && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted">Reason</dt>
              <dd className="text-foreground">{LOST_REASON_LABEL[deal.lostReason]}</dd>
            </div>
          )}
          {deal.competitor !== null && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted">Competitor</dt>
              <dd className="min-w-0 break-words text-foreground">{deal.competitor}</dd>
            </div>
          )}
          {deal.lostNote !== null && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted">Note</dt>
              <dd className="min-w-0 break-words text-foreground">{deal.lostNote}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">Re-engage</dt>
            <dd className="text-foreground">
              {deal.reengageAt === null ? "Not scheduled" : formatDay(deal.reengageAt)}
            </dd>
          </div>
        </dl>
      </Section>
    );
  }

  function assign(serviceLine: string, userId: string) {
    if (handoff === null) return;
    startTransition(async () => {
      const result = await assignHandoffAction(handoff.id, serviceLine, userId);
      if (result.ok) {
        toast.success("Delivery owner updated.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function exportRecord() {
    if (handoff === null) return;
    startTransition(async () => {
      const result = await exportHandoffAction(handoff.id);
      if (result.ok) {
        // Shown as a link to click. Opening a window here, after the request, is no longer a direct
        // result of the click, and browsers block it as a pop-up.
        setExportUrl(result.data.url);
        toast.success("The handoff export is ready to download.");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Section
      eyebrow="Outcome"
      title="Deal won"
      variant="zone"
      emphasized
      actions={
        handoff === null ? undefined : exportUrl === null ? (
          <Button variant="secondary" loading={pending} onClick={exportRecord}>
            <Download aria-hidden className="size-4" />
            Export handoff
          </Button>
        ) : (
          <DownloadLink
            href={exportUrl}
            variant="secondary"
            target="_blank"
            rel="noreferrer noopener"
          >
            <Download aria-hidden className="size-4" />
            Download handoff
          </DownloadLink>
        )
      }
    >
      <dl className="flex flex-col gap-2 text-sm">
        {deal.valueMinor !== null && deal.currency !== null && (
          <div className="flex items-baseline gap-2">
            <dt className="shrink-0 text-muted">Deal value</dt>
            <dd className="text-lg font-semibold text-heading">
              <Money value={{ amountMinor: deal.valueMinor, currency: deal.currency }} />
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <dt className="shrink-0 text-muted">Services</dt>
          <dd className="text-foreground">
            {deal.services.map((line) => SERVICE_LINE_LABEL[line]).join(", ")}
          </dd>
        </div>
        {deal.startDate !== null && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">Start date</dt>
            <dd className="text-foreground">{formatDay(deal.startDate)}</dd>
          </div>
        )}
        {deal.notes !== null && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">Notes</dt>
            <dd className="max-w-prose min-w-0 break-words text-foreground">{deal.notes}</dd>
          </div>
        )}
      </dl>

      {handoff !== null && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-heading">Handoff record</h3>
            {handoff.status === "ACKNOWLEDGED" ? (
              <ToneBadge tone="success">Acknowledged</ToneBadge>
            ) : (
              <ToneBadge tone="info" icon={Clock}>
                Waiting for delivery
              </ToneBadge>
            )}
          </div>

          {handoff.scope.length > 0 && (
            <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-sm text-foreground">
              {handoff.scope.map((item) => (
                <li key={item} className="break-words">
                  {item}
                </li>
              ))}
            </ul>
          )}

          <ul className="flex flex-col gap-4">
            {handoff.assignments.map((assignment) => {
              const current = assignment.assigned ?? assignment.suggested;
              // The line's own team, plus whoever holds the assignment now: they may have left the
              // team since, and a select with no matching option would show someone else.
              const options = withPerson(teamByLine[assignment.serviceLine] ?? [], current);
              return (
                <li key={assignment.serviceLine} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground">
                    {SERVICE_LINE_LABEL[assignment.serviceLine]}
                  </span>
                  <span className="text-muted">
                    {assignment.assigned !== null
                      ? `Assigned to ${assignment.assigned.name}`
                      : assignment.suggested !== null
                        ? `Suggested: ${assignment.suggested.name}`
                        : "No delivery owner yet"}
                  </span>
                  {capabilities.assignHandoff && options.length > 0 && (
                    <div className="max-w-xs">
                      <Select
                        aria-label={`Delivery owner for ${SERVICE_LINE_LABEL[assignment.serviceLine]}`}
                        value={assignment.assigned?.id ?? ""}
                        disabled={pending}
                        placeholder="Choose a delivery owner"
                        options={options}
                        onChange={(e) => {
                          if (e.target.value !== "") assign(assignment.serviceLine, e.target.value);
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}
