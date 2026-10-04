"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, MoreHorizontal } from "lucide-react";

import {
  CURRENCY_EXPONENT,
  type Currency,
  type LeadStatus,
  type MoneyByCurrency,
} from "@/contracts/common";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarketBadge } from "@/components/ui/market-badge";
import { Money } from "@/components/ui/money";
import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/cn";

import { OwnerAvatar } from "../leads/owner-avatar";
import { ToneBadge } from "../leads/tone-badge";
import { columnLabel, type BoardCardView } from "./board-types";

const COUNT = new Intl.NumberFormat("en-GB");
const CURRENCY_ORDER = Object.keys(CURRENCY_EXPONENT) as Currency[];

/**
 * A stage's count and value. The value is listed per currency in compact form and never summed
 * across currencies (INV-11); every figure is the pipeline service's. `visible` differs from
 * `stageCount` when a card filter is hiding some of the stage, or the stage holds more cards than
 * the board lists.
 */
export function StageSummary({
  visible,
  stageCount,
  totals,
}: {
  visible: number;
  stageCount: number;
  totals: MoneyByCurrency;
}) {
  const amounts = CURRENCY_ORDER.flatMap((currency) => {
    const amountMinor = totals[currency];
    return amountMinor === undefined || amountMinor === 0 ? [] : [{ currency, amountMinor }];
  });

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
      <span className="font-mono tabular-nums">
        {visible === stageCount
          ? COUNT.format(stageCount)
          : `${COUNT.format(visible)} of ${COUNT.format(stageCount)}`}
      </span>
      {amounts.map((amount) => (
        <span key={amount.currency} className="flex items-center gap-2">
          <span aria-hidden>·</span>
          <Money value={amount} compact />
        </span>
      ))}
    </p>
  );
}

/** Shown under a stage that holds more matching leads than the board lists. */
export function StageOverflowNote({ hidden }: { hidden: number }) {
  if (hidden <= 0) return null;
  return (
    <p className="px-1 text-sm text-muted">
      {COUNT.format(hidden)} more {hidden === 1 ? "lead is" : "leads are"} not shown. Filter the
      board, or open the leads list, to reach them.
    </p>
  );
}

export function PipelineCardBody({
  card,
  handle,
  href,
  timezone,
  moveTargets,
  onOpen,
  onSetNextAction,
  onMove,
}: {
  card: BoardCardView;
  /** The card's drag handle, from the board (null when the card can't be dragged). */
  handle?: ReactNode;
  href: string;
  timezone: string;
  /** The stages this card may move to (empty when the user can't move it). */
  moveTargets: LeadStatus[];
  onOpen: (card: BoardCardView) => void;
  onSetNextAction: (card: BoardCardView) => void;
  onMove: (card: BoardCardView, target: LeadStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* One row of full-size targets: drag handle, the name (opens the lead), the actions menu. */}
      <div className="flex items-start gap-1">
        {handle}
        <button
          type="button"
          onClick={() => {
            onOpen(card);
          }}
          className="flex min-h-12 min-w-0 flex-1 items-center rounded px-1 text-left font-medium text-heading hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="line-clamp-2 min-w-0 break-words">{card.companyName}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${card.companyName}`}
            className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                onOpen(card);
              }}
            >
              Open
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={href}>Open full page</Link>
            </DropdownMenuItem>
            {card.canMove && (
              <DropdownMenuItem
                onSelect={() => {
                  onSetNextAction(card);
                }}
              >
                Set next action
              </DropdownMenuItem>
            )}
            {moveTargets.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {moveTargets.map((target) => (
                  <DropdownMenuItem
                    key={target}
                    onSelect={() => {
                      onMove(card, target);
                    }}
                  >
                    {columnLabel(target)}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-w-0 flex-col gap-2 px-1 pb-1">
        {card.contactName !== null && (
          <p className="truncate text-sm text-muted">{card.contactName}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <MarketBadge market={card.market} />
          {card.stale && (
            <ToneBadge tone="warning" icon={Clock}>
              Stale
            </ToneBadge>
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
          <span className="text-muted">
            <span className="font-mono tabular-nums">{COUNT.format(card.daysInStage)}</span>{" "}
            {card.daysInStage === 1 ? "day" : "days"} in stage
          </span>
          {card.estimatedValue !== null && (
            <Money value={card.estimatedValue} className="text-foreground" />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          {card.nextActionAt === null ? (
            <span className="text-muted">No next action</span>
          ) : (
            <span
              className={cn(
                "inline-flex min-w-0 flex-wrap items-center gap-1",
                card.overdue && "text-danger",
              )}
            >
              {card.overdue && <AlertTriangle aria-hidden className="size-3.5 shrink-0" />}
              <RelativeTime
                value={card.nextActionAt}
                timezone={timezone}
                {...(card.overdue ? { className: "text-danger" } : {})}
              />
              {card.overdue && <span className="font-medium">· overdue</span>}
            </span>
          )}
          {card.ownerName !== null && (
            <OwnerAvatar name={card.ownerName} label={`Owner: ${card.ownerName}`} />
          )}
        </div>
        {card.nextActionNote !== null && (
          <p className="line-clamp-2 text-sm break-words text-muted">{card.nextActionNote}</p>
        )}
      </div>
    </div>
  );
}
