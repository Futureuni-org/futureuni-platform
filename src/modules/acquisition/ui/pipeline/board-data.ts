import "server-only";

/**
 * Server-side loaders for the pipeline board. The board itself, its per-stage counts and its
 * per-currency stage values come from `getPipeline`; "won this month" comes from
 * `getRevenueSummary`. This file adds no money arithmetic of its own: it filters which cards are
 * shown, works out the allowed moves from the canonical transitions table, and maps to plain views.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import {
  CurrencySchema,
  type Actor,
  type Currency,
  type LeadStatus,
  type Market,
  type ServiceLine,
} from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { canFromUser } from "@/platform/auth";
import { canTransition } from "@/modules/acquisition/core";
import {
  getPipeline,
  getRevenueSummary,
  type PipelineCard,
  type PipelineColumn,
} from "@/modules/acquisition/pipeline";

import { lineHref } from "@/modules/acquisition/ui/shell";
import { enumLabel } from "../leads/format";
import { getLeadHeader } from "../leads/lead-detail.repo";
import { getFindingClaims } from "../leads/lead-pipeline.repo";
import {
  STAGE_CARD_LIMIT,
  type BoardCardView,
  type BoardColumnView,
  type BoardFilters,
  type BoardView,
  type LeadSheetView,
} from "./board-types";
import { listBoardProposalRefs } from "./pipeline-board.repo";

type CurrentUser = NonNullable<Parameters<typeof canFromUser>[0]>;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? undefined : v;
}

function parseAmount(raw: string | undefined, currency: Currency): number | null {
  if (raw === undefined) return null;
  try {
    return toMinor(raw, currency);
  } catch {
    return null;
  }
}

export function parseBoardFilters(sp: Record<string, string | string[] | undefined>): BoardFilters {
  const marketRaw = one(sp.market);
  const market: Market | undefined =
    marketRaw === "NIGERIA" || marketRaw === "INTERNATIONAL" ? marketRaw : undefined;

  const currency = CurrencySchema.safeParse(one(sp.valueCurrency));
  let value: BoardFilters["value"];
  if (currency.success) {
    const minMinor = parseAmount(one(sp.valueMin), currency.data);
    const maxMinor = parseAmount(one(sp.valueMax), currency.data);
    if (minMinor !== null || maxMinor !== null)
      value = { currency: currency.data, minMinor, maxMinor };
  }

  return {
    market,
    ownerId: one(sp.owner),
    overdueOnly: one(sp.overdue) === "1",
    staleOnly: one(sp.stale) === "1",
    value,
    showNurture: one(sp.nurture) === "1",
    showAwaiting: one(sp.awaiting) === "1",
  };
}

function matches(card: PipelineCard, filters: BoardFilters): boolean {
  if (filters.overdueOnly && !card.overdue) return false;
  if (filters.staleOnly && !card.stale) return false;
  if (filters.value !== undefined) {
    const estimate = card.estimatedValue;
    if (estimate?.currency !== filters.value.currency) return false;
    if (filters.value.minMinor !== null && estimate.amountMinor < filters.value.minMinor)
      return false;
    if (filters.value.maxMinor !== null && estimate.amountMinor > filters.value.maxMinor)
      return false;
  }
  return true;
}

export async function loadBoard(
  actor: Actor,
  user: CurrentUser,
  serviceLine: ServiceLine,
  filters: BoardFilters,
): Promise<BoardView> {
  const board = await getPipeline(actor, {
    serviceLine,
    ...(filters.market === undefined ? {} : { market: filters.market }),
    ...(filters.ownerId === undefined ? {} : { ownerId: filters.ownerId }),
  });

  // Filter and cut each stage first, so the proposal lookup below covers only the cards shown.
  const cut = (column: PipelineColumn) => {
    const matching = column.cards.filter((card) => matches(card, filters));
    return {
      column,
      cards: matching.slice(0, STAGE_CARD_LIMIT),
      hiddenCount: Math.max(matching.length - STAGE_CARD_LIMIT, 0),
    };
  };
  const columns = board.columns.map(cut);
  const nurture = cut(board.nurture);
  const proposals = await listBoardProposalRefs(
    [...columns, nurture].flatMap((stage) => stage.cards.map((card) => card.leadId)),
  );

  const toCard = (card: PipelineCard): BoardCardView => {
    const refs = proposals.get(card.leadId) ?? [];
    return {
      id: card.leadId,
      status: card.status,
      companyName: card.companyName,
      contactName: card.contactName,
      ownerName: card.ownerName,
      market: card.market,
      daysInStage: card.daysInStage,
      nextActionAt: card.nextActionAt === null ? null : card.nextActionAt.toISOString(),
      nextActionNote: card.nextActionNote,
      overdue: card.overdue,
      stale: card.stale,
      estimatedValue: card.estimatedValue,
      canMove: canFromUser(user, "acquisition.pipeline.move", {
        serviceLine,
        ...(card.ownerId === null ? {} : { ownerId: card.ownerId }),
      }),
      proposals: refs.map((p) => ({
        id: p.id,
        label: `Version ${String(p.version)} · ${enumLabel(p.status)}`,
      })),
      hasProposal: refs.length > 0,
    };
  };

  const toColumn = (stage: ReturnType<typeof cut>): BoardColumnView => ({
    status: stage.column.status,
    cards: stage.cards.map(toCard),
    hiddenCount: stage.hiddenCount,
    stageCount: stage.column.count,
    stageTotals: stage.column.totalsByCurrency,
  });

  // Allowed moves between board stages, straight from the canonical transitions table.
  const stages: LeadStatus[] = [...board.columns.map((c) => c.status), board.nurture.status];
  const allowedMoves: BoardView["allowedMoves"] = {};
  for (const from of stages) {
    allowedMoves[from] = stages.filter((to) => to !== from && canTransition(from, to));
  }

  return {
    columns: columns.map(toColumn),
    nurture: toColumn(nurture),
    allowedMoves,
    filtered: filters.overdueOnly || filters.staleOnly || filters.value !== undefined,
  };
}

/**
 * The instant the current month starts in `timezone`. Built from the calendar month there, not
 * from today's UTC offset, so a daylight-saving change during the month doesn't move the boundary
 * by an hour. An unknown timezone name falls back to the UTC month rather than failing the page.
 */
function monthStartIn(timezone: string, now: Date): Date {
  try {
    const month = formatInTimeZone(now, timezone, "yyyy-MM");
    const start = fromZonedTime(`${month}-01T00:00:00`, timezone);
    if (!Number.isNaN(start.getTime())) return start;
  } catch {
    // Not a timezone this runtime knows: use the UTC month below.
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface WonThisMonth {
  currency: Currency;
  amountMinor: number;
  count: number;
}

/**
 * Revenue won since the start of the viewer's current month, per currency (never summed). Null
 * when the viewer may not read revenue, so the header leaves the figure out; any other failure is
 * a real one and is thrown.
 */
export async function loadWonThisMonth(
  actor: Actor,
  serviceLine: ServiceLine,
  market: Market | undefined,
  timezone: string,
  now: Date,
): Promise<WonThisMonth[] | null> {
  try {
    const summary = await getRevenueSummary(actor, {
      serviceLine,
      ...(market === undefined ? {} : { market }),
      from: monthStartIn(timezone, now),
      to: now,
    });
    return summary.byCurrency.map((row) => ({
      currency: row.currency,
      amountMinor: row.revenueMinor,
      count: row.wonCount,
    }));
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") return null;
    throw error;
  }
}

/** The compact summary for the board's side sheet, or null if the lead isn't in this line. */
export async function loadLeadSheet(
  leadId: string,
  serviceLine: ServiceLine,
): Promise<LeadSheetView | null> {
  const header = await getLeadHeader(leadId);
  if (header?.serviceLine !== serviceLine) return null;
  const findings = await getFindingClaims(header.keyFindingIds);
  const primary = header.contacts.find((c) => c.isPrimary) ?? null;
  const place = [header.company.city, header.country ?? header.company.country]
    .filter((v) => v !== null && v !== "")
    .join(", ");

  return {
    id: header.id,
    href: lineHref(serviceLine, `leads/${header.id}`),
    companyName: header.company.name,
    place: place === "" ? null : place,
    status: header.status,
    market: header.market,
    score: header.score,
    scoreBand: header.scoreBand,
    brief: header.brief,
    ownerName: header.owner?.name ?? null,
    primaryContact:
      primary === null ? null : { name: primary.name, role: primary.role, email: primary.email },
    nextActionAt: header.nextActionAt === null ? null : header.nextActionAt.toISOString(),
    nextActionNote: header.nextActionNote,
    topFindings: findings.map((f) => ({ id: f.id, claim: f.claim, severity: f.severity })),
  };
}
