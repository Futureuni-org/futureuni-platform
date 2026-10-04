"use client";

import { MarketBadge } from "@/components/ui/market-badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";

import { ButtonLink } from "../leads/button-link";
import { EvidenceChip } from "../leads/evidence-chip";
import { ScoreMeter } from "../leads/score-meter";
import type { LeadSheetView } from "./board-types";

/**
 * The lead summary that opens beside the board when a card is selected (`?lead=`), so the board
 * stays in view. "Open full page" goes to the lead detail.
 */
export function LeadSheet({
  sheet,
  timezone,
  onClose,
}: {
  sheet: LeadSheetView | null;
  timezone: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={sheet !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto">
        {sheet !== null && (
          <>
            <div className="flex flex-col gap-1 pr-8">
              {/* Names, briefs and notes are scraped or typed text: a long unbroken string wraps. */}
              <SheetTitle className="font-display text-2xl font-semibold break-words text-heading">
                {sheet.companyName}
              </SheetTitle>
              <SheetDescription className="text-sm break-words text-muted">
                {sheet.place ?? "Location unknown"}
              </SheetDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="lead" value={sheet.status} />
              <MarketBadge market={sheet.market} />
              <ScoreMeter score={sheet.score} band={sheet.scoreBand} />
            </div>

            {sheet.brief !== null && <p className="break-words text-foreground">{sheet.brief}</p>}

            <dl className="flex min-w-0 flex-col gap-3 text-sm break-words">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Owner
                </dt>
                <dd className="text-foreground">{sheet.ownerName ?? "Unassigned"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Primary contact
                </dt>
                <dd className="text-foreground">
                  {sheet.primaryContact === null ? (
                    "No primary contact"
                  ) : (
                    <>
                      {sheet.primaryContact.name ?? "Unnamed contact"}
                      {sheet.primaryContact.role !== null && (
                        <span className="text-muted"> · {sheet.primaryContact.role}</span>
                      )}
                      {sheet.primaryContact.email !== null && (
                        <span className="block break-all text-muted">
                          {sheet.primaryContact.email}
                        </span>
                      )}
                    </>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Next action
                </dt>
                <dd className="text-foreground">
                  {sheet.nextActionAt === null ? (
                    "Nothing scheduled"
                  ) : (
                    <RelativeTime value={sheet.nextActionAt} timezone={timezone} />
                  )}
                  {sheet.nextActionNote !== null && (
                    <span className="block">{sheet.nextActionNote}</span>
                  )}
                </dd>
              </div>
            </dl>

            {sheet.topFindings.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Key findings
                </p>
                <ul className="flex flex-col gap-2">
                  {sheet.topFindings.map((finding) => (
                    <li key={finding.id}>
                      <EvidenceChip claim={finding.claim} severity={finding.severity} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto pt-2">
              <ButtonLink href={sheet.href} variant="secondary">
                Open full page
              </ButtonLink>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
