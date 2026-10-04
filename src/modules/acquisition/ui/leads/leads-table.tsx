"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MouseEvent } from "react";
import { AlertTriangle, Link2, ShieldAlert } from "lucide-react";

import type { LeadStatus, Market, ScoreBand } from "@/contracts/common";
import { MarketBadge } from "@/components/ui/market-badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";

import { OwnerAvatar } from "./owner-avatar";
import { ScoreMeter } from "./score-meter";
import { ToneBadge } from "./tone-badge";

/** Client-facing lead row (dates as ISO strings so it crosses the RSC boundary as plain data). */
export interface LeadRowView {
  id: string;
  href: string;
  companyName: string;
  city: string | null;
  country: string | null;
  market: Market;
  status: LeadStatus;
  score: number | null;
  scoreBand: ScoreBand | null;
  strongestFinding: string | null;
  owner: { id: string; name: string | null; image: string | null } | null;
  lastActivityAt: string;
  nextActionAt: string | null;
  nextActionNote: string | null;
  overdue: boolean;
  source: string;
  needsHumanReview: boolean;
  complianceReview: boolean;
  inCrossSellGroup: boolean;
}

function FlagBadges({ row }: { row: LeadRowView }) {
  if (!row.needsHumanReview && !row.complianceReview && !row.inCrossSellGroup) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {row.needsHumanReview && <ToneBadge tone="warning">Needs review</ToneBadge>}
      {row.complianceReview && (
        <ToneBadge tone="danger" icon={ShieldAlert}>
          Compliance
        </ToneBadge>
      )}
      {row.inCrossSellGroup && (
        <ToneBadge tone="info" icon={Link2}>
          Cross-sell
        </ToneBadge>
      )}
    </div>
  );
}

/** An empty cell: a dash to look at, "None" for a screen reader. */
function Empty() {
  return (
    <span className="text-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  );
}

function NextAction({ row, timezone }: { row: LeadRowView; timezone: string }) {
  if (row.nextActionAt === null) return <Empty />;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", row.overdue && "text-danger")}>
      {row.overdue && <AlertTriangle aria-hidden className="size-3.5" />}
      <RelativeTime value={row.nextActionAt} timezone={timezone} />
      {row.overdue && <span className="sr-only">(overdue)</span>}
    </span>
  );
}

function OwnerCell({ owner }: { owner: LeadRowView["owner"] }) {
  if (owner === null) return <span className="text-muted">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <OwnerAvatar name={owner.name ?? "?"} src={owner.image} />
      <span className="truncate text-sm">{owner.name ?? "Unknown"}</span>
    </span>
  );
}

function RowCheckbox({
  id,
  companyName,
  checked,
  onToggle,
}: {
  id: string;
  companyName: string;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    // The label is the touch target: 48px square around a checkbox that stays a normal size.
    <label className="flex size-12 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {
          onToggle(id);
        }}
        aria-label={`Select ${companyName}`}
        className="size-5 accent-[var(--primary)]"
      />
    </label>
  );
}

export function LeadsTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  timezone,
}: {
  rows: LeadRowView[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  timezone: string;
}) {
  const router = useRouter();
  const allIds = rows.map((r) => r.id);
  const allSelected = rows.length > 0 && allIds.every((id) => selected.has(id));

  /** A click anywhere on a row opens the lead, unless it landed on a control inside the row. */
  function rowClick(event: MouseEvent<HTMLElement>, href: string) {
    const target = event.target;
    if (target instanceof Element && target.closest("a,button,input,label") !== null) return;
    router.push(href);
  }

  return (
    <div>
      {/* Desktop table. It scrolls sideways inside its own box if the columns don't fit. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Leads</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="w-12 py-2 pr-1">
                <label className="flex size-12 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      onToggleAll(allIds, !allSelected);
                    }}
                    aria-label={allSelected ? "Deselect all leads" : "Select all leads"}
                    className="size-5 accent-[var(--primary)]"
                  />
                </label>
              </th>
              {[
                "Company",
                "Score",
                "Strongest finding",
                "Owner",
                "Last activity",
                "Next action",
                "Source",
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="py-2 pr-4 text-xs font-semibold tracking-[0.06em] text-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={(e) => {
                  rowClick(e, row.href);
                }}
                className={cn(
                  "cursor-pointer border-b border-border/60 last:border-0 hover:bg-zone/60",
                  selected.has(row.id) && "bg-primary-soft/40",
                )}
              >
                <td className="py-0.5 pr-1 align-top">
                  <RowCheckbox
                    id={row.id}
                    companyName={row.companyName}
                    checked={selected.has(row.id)}
                    onToggle={onToggle}
                  />
                </td>
                <td className="max-w-xs py-3 pr-4 align-top">
                  <Link
                    href={row.href}
                    className="font-medium break-words text-heading hover:text-primary"
                  >
                    {row.companyName}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    {[row.city, row.country].filter((v) => v !== null && v !== "").join(", ") ||
                      "—"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <MarketBadge market={row.market} />
                    <StatusBadge kind="lead" value={row.status} />
                    <FlagBadges row={row} />
                  </div>
                </td>
                <td className="py-3 pr-4 align-top">
                  {/* With its band label: the bar's colour alone doesn't say which band it is. */}
                  <ScoreMeter score={row.score} band={row.scoreBand} />
                </td>
                <td className="max-w-xs py-3 pr-4 align-top text-sm text-muted">
                  {row.strongestFinding === null ? (
                    <Empty />
                  ) : (
                    <span className="line-clamp-2 break-words">{row.strongestFinding}</span>
                  )}
                </td>
                <td className="py-3 pr-4 align-top">
                  <OwnerCell owner={row.owner} />
                </td>
                <td className="py-3 pr-4 align-top text-sm text-muted">
                  <RelativeTime value={row.lastActivityAt} timezone={timezone} />
                </td>
                <td className="py-3 pr-4 align-top">
                  <NextAction row={row} timezone={timezone} />
                </td>
                <td className="py-3 pr-4 align-top text-sm break-words text-muted">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            onClick={(e) => {
              rowClick(e, row.href);
            }}
            className={cn(
              "flex flex-col gap-2 rounded-lg bg-zone px-4 py-3",
              selected.has(row.id) && "ring-2 ring-focus",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={row.href}
                  className="font-medium break-words text-heading hover:text-primary"
                >
                  {row.companyName}
                </Link>
                <div className="text-xs text-muted">
                  {[row.city, row.country].filter((v) => v !== null && v !== "").join(", ") || "—"}
                </div>
              </div>
              <RowCheckbox
                id={row.id}
                companyName={row.companyName}
                checked={selected.has(row.id)}
                onToggle={onToggle}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <MarketBadge market={row.market} />
              <StatusBadge kind="lead" value={row.status} />
              <FlagBadges row={row} />
            </div>
            <ScoreMeter score={row.score} band={row.scoreBand} />
            {row.strongestFinding !== null && (
              <p className="line-clamp-2 text-sm text-muted">{row.strongestFinding}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <OwnerCell owner={row.owner} />
              <NextAction row={row} timezone={timezone} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
