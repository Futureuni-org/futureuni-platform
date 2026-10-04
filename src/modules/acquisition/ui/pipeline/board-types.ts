import type { Currency, LeadStatus, Market, MoneyByCurrency, ScoreBand } from "@/contracts/common";

/**
 * Client-safe types and rules for the pipeline board: the card and column views the server hands
 * over, and `dropOutcome`, the pure decision of what a drop means. Which moves are allowed is not
 * decided here: the server works that out from the canonical transitions table
 * (`canTransition` in `@/modules/acquisition/core`) and passes it in as `allowedMoves`.
 */

export const BOARD_COLUMN_LABEL: Partial<Record<LeadStatus, string>> = {
  CONTACTED: "Awaiting reply",
  REPLIED: "Conversation",
  MEETING_BOOKED: "Meeting booked",
  PROPOSAL_SENT: "Proposal sent",
  WON: "Won",
  LOST: "Lost",
  NURTURE: "Nurture",
};

export function columnLabel(status: LeadStatus): string {
  return BOARD_COLUMN_LABEL[status] ?? status;
}

export interface BoardCardView {
  id: string;
  status: LeadStatus;
  companyName: string;
  contactName: string | null;
  ownerName: string | null;
  market: Market;
  daysInStage: number;
  nextActionAt: string | null;
  nextActionNote: string | null;
  overdue: boolean;
  stale: boolean;
  estimatedValue: { amountMinor: number; currency: Currency } | null;
  /** Whether this user may move this card (`acquisition.pipeline.move` for its owner and line). */
  canMove: boolean;
  /** Live proposals for the Won dialog's "linked proposal" picker. */
  proposals: { id: string; label: string }[];
  /** True when a proposal exists that could be sent (approved) or already has been. */
  hasProposal: boolean;
}

/**
 * The most cards one stage renders. The pipeline service returns every lead in a stage, so a busy
 * line would otherwise send thousands of cards to the browser; the board shows the first ones, says
 * how many it left out, and the filters narrow the stage. See CR-16-BOARD-BOUNDS in REQUESTS.md.
 */
export const STAGE_CARD_LIMIT = 100;

export interface BoardColumnView {
  status: LeadStatus;
  /** Cards after the screen's filters, cut at `STAGE_CARD_LIMIT`. */
  cards: BoardCardView[];
  /** How many matching cards the cut left out (0 when the whole stage is shown). */
  hiddenCount: number;
  /** The stage's full count and per-currency value, as the pipeline service computed them. */
  stageCount: number;
  stageTotals: MoneyByCurrency;
}

export interface BoardView {
  columns: BoardColumnView[];
  nurture: BoardColumnView;
  /** From-status → the board stages a lead in that status may move to. */
  allowedMoves: Partial<Record<LeadStatus, LeadStatus[]>>;
  /** True when a card-level filter is hiding some cards, so stage totals cover more than is shown. */
  filtered: boolean;
}

export type BoardDialog = "won" | "lost" | "meeting" | "nurture" | "proposal";

export type DropOutcome =
  | { kind: "none" }
  | { kind: "invalid"; message: string }
  | { kind: "dialog"; dialog: BoardDialog }
  | { kind: "move"; to: "REPLIED" };

/**
 * What dropping `card` on the `target` stage should do (module spec US-32):
 * - the same stage does nothing;
 * - a stage the transitions table doesn't allow snaps back with the reason (AC-32.4);
 * - Won, Lost, Meeting booked and Nurture need information first, so they open a dialog, and
 *   cancelling that dialog cancels the move (AC-32.2);
 * - Proposal sent is only ever reached by sending a proposal, so it offers that instead (AC-32.3);
 * - Conversation is a plain move.
 */
export function dropOutcome(
  card: Pick<BoardCardView, "status" | "canMove">,
  target: LeadStatus,
  allowedMoves: BoardView["allowedMoves"],
): DropOutcome {
  if (card.status === target) return { kind: "none" };

  if (!card.canMove) {
    return { kind: "invalid", message: "You can only move leads you own." };
  }

  const allowed = allowedMoves[card.status] ?? [];
  if (!allowed.includes(target)) {
    return {
      kind: "invalid",
      message: `A lead can't move from ${columnLabel(card.status)} to ${columnLabel(target)}.`,
    };
  }

  switch (target) {
    case "WON":
      return { kind: "dialog", dialog: "won" };
    case "LOST":
      return { kind: "dialog", dialog: "lost" };
    case "MEETING_BOOKED":
      return { kind: "dialog", dialog: "meeting" };
    case "NURTURE":
      return { kind: "dialog", dialog: "nurture" };
    case "PROPOSAL_SENT":
      return { kind: "dialog", dialog: "proposal" };
    case "REPLIED":
      return { kind: "move", to: "REPLIED" };
    default:
      return {
        kind: "invalid",
        message: `A lead can't be moved to ${columnLabel(target)} from the board.`,
      };
  }
}

/** The compact lead summary shown in the board's side sheet. */
export interface LeadSheetView {
  id: string;
  href: string;
  companyName: string;
  place: string | null;
  status: LeadStatus;
  market: Market;
  score: number | null;
  scoreBand: ScoreBand | null;
  brief: string | null;
  ownerName: string | null;
  primaryContact: { name: string | null; role: string | null; email: string | null } | null;
  nextActionAt: string | null;
  nextActionNote: string | null;
  topFindings: { id: string; claim: string; severity: string }[];
}

/** Board filters kept in the URL. */
export interface BoardFilters {
  market?: Market | undefined;
  ownerId?: string | undefined;
  overdueOnly: boolean;
  staleOnly: boolean;
  value?: { currency: Currency; minMinor: number | null; maxMinor: number | null } | undefined;
  showNurture: boolean;
  showAwaiting: boolean;
}
