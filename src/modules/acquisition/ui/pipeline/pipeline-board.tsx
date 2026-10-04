"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MARKET_CURRENCIES, type LeadStatus, type ServiceLine } from "@/contracts/common";
import { Select } from "@/components/admin";
import { registerCommand, useShortcut } from "@/components/patterns/shortcuts";
import { EmptyState } from "@/components/patterns/states";
import { useReducedMotionSafe } from "@/lib/motion";

import { ButtonLink } from "../leads/button-link";
import { setNextActionAction } from "../leads/detail-actions";
import { useUrlParams } from "../leads/use-url-params";
import { LostDialog, WonDialog } from "../leads/won-lost-dialogs";
import { failureOf } from "./action-failure";
import { moveToConversationAction, moveToMeetingAction, moveToNurtureAction } from "./actions";
import { MeetingMoveDialog, ProposalHintDialog, UntilMoveDialog } from "./board-dialogs";
import {
  columnLabel,
  dropOutcome,
  type BoardCardView,
  type BoardColumnView,
  type BoardDialog,
  type BoardView,
  type LeadSheetView,
} from "./board-types";
import { KanbanBoard, type KanbanColumn } from "./kanban-board";
import { LeadSheet } from "./lead-sheet";
import { PipelineCardBody, StageOverflowNote, StageSummary } from "./pipeline-card";

type OpenDialog = { kind: BoardDialog | "nextAction"; card: BoardCardView } | null;

interface Move {
  cardId: string;
  to: LeadStatus;
}
const NO_MOVES: Move[] = [];

function visibleColumns(board: BoardView, showNurture: boolean): BoardColumnView[] {
  return showNurture ? [...board.columns, board.nurture] : board.columns;
}

/** Move a card to another stage in a copy of the columns (the optimistic update). */
function withCardMoved(
  columns: BoardColumnView[],
  cardId: string,
  to: LeadStatus,
): BoardColumnView[] {
  const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
  if (card === undefined) return columns;
  return columns.map((column) => {
    const without = column.cards.filter((c) => c.id !== cardId);
    return column.status === to
      ? { ...column, cards: [{ ...card, status: to, daysInStage: 0 }, ...without] }
      : { ...column, cards: without };
  });
}

export function PipelineBoard({
  board,
  serviceLine,
  leadsPath,
  timezone,
  sheet,
  showNurture,
  showAwaiting,
}: {
  board: BoardView;
  serviceLine: ServiceLine;
  leadsPath: string;
  timezone: string;
  sheet: LeadSheetView | null;
  showNurture: boolean;
  showAwaiting: boolean;
}) {
  const router = useRouter();
  const setParams = useUrlParams();
  const reducedMotion = useReducedMotionSafe();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [announcement, setAnnouncement] = useState("");

  // Optimistic moves, layered over the server's board. They belong to the board they were made
  // on: the server is the source of truth, so once it sends a fresh board they no longer apply.
  const [optimistic, setOptimistic] = useState<{ board: BoardView; moves: Move[] }>({
    board,
    moves: NO_MOVES,
  });
  const moves = optimistic.board === board ? optimistic.moves : NO_MOVES;
  const columns = useMemo(
    () =>
      moves.reduce(
        (current, move) => withCardMoved(current, move.cardId, move.to),
        visibleColumns(board, showNurture),
      ),
    [board, showNurture, moves],
  );

  function moveCard(cardId: string, to: LeadStatus) {
    setOptimistic((current) => ({
      board,
      moves: [...(current.board === board ? current.moves : NO_MOVES), { cardId, to }],
    }));
  }

  function undoMove(cardId: string) {
    setOptimistic((current) => ({
      board: current.board,
      moves: current.moves.filter((move) => move.cardId !== cardId),
    }));
  }

  const toggleNurture = useCallback(() => {
    setParams({ nurture: showNurture ? null : "1" });
  }, [setParams, showNurture]);
  const toggleAwaiting = useCallback(() => {
    setParams({ awaiting: showAwaiting ? null : "1" });
  }, [setParams, showAwaiting]);

  // Single-key shortcuts belong to the board. While a dialog or the lead sheet is open they are
  // off, so a stray "n" there doesn't rearrange the board behind it.
  const overlayOpen = dialog !== null || sheet !== null;
  useShortcut("n", toggleNurture, {
    enabled: !overlayOpen,
    description: "Show or hide the nurture lane",
  });
  useShortcut("a", toggleAwaiting, {
    enabled: !overlayOpen,
    description: "Expand or collapse Awaiting reply",
  });

  // Registered again whenever the toggle changes. `useCommand` keeps the object it was given when
  // the board mounted, so its `perform` would go on toggling from the lane's first state and from
  // the URL as it was then, undoing filters changed since.
  useEffect(
    () =>
      registerCommand({
        id: "acquisition.pipeline.toggle-nurture",
        label: showNurture ? "Hide the nurture lane" : "Show the nurture lane",
        group: "Actions",
        shortcut: "N",
        perform: toggleNurture,
      }),
    [showNurture, toggleNurture],
  );

  function closeDialog(open: boolean) {
    if (!open) setDialog(null);
  }

  function leadHref(card: BoardCardView): string {
    return `${leadsPath}/${card.id}`;
  }

  /** Apply a move that the server has already accepted, then refresh the stage totals. */
  function settle(card: BoardCardView, to: LeadStatus, message: string) {
    moveCard(card.id, to);
    setAnnouncement(`${card.companyName} moved to ${columnLabel(to)}.`);
    toast.success(message);
    router.refresh();
  }

  /** Try to move a card to a stage: by drag, by keyboard, or from the card's menu. */
  function attempt(card: BoardCardView, target: LeadStatus) {
    const outcome = dropOutcome(card, target, board.allowedMoves);
    switch (outcome.kind) {
      case "none":
        return;
      case "invalid":
        // The card was never moved, so it is already back where it started.
        toast.error(outcome.message);
        setAnnouncement(outcome.message);
        return;
      case "dialog":
        setDialog({ kind: outcome.dialog, card });
        return;
      case "move": {
        moveCard(card.id, outcome.to);
        setAnnouncement(`${card.companyName} moved to ${columnLabel(outcome.to)}.`);
        startTransition(async () => {
          // A refused move and a request that never arrived both put the card back and say why.
          const failure = await failureOf(() => moveToConversationAction(card.id));
          if (failure === null) {
            router.refresh();
          } else {
            undoMove(card.id);
            toast.error(failure);
            setAnnouncement(`${card.companyName} was moved back. ${failure}`);
          }
        });
        return;
      }
    }
  }

  function onDrop({ cardId, to }: { cardId: string; to: string }) {
    const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
    if (card !== undefined) attempt(card, to as LeadStatus);
  }

  function jumpToColumn(status: string) {
    document.getElementById(`kanban-col-${status}`)?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      inline: "start",
      block: "nearest",
    });
  }

  const kanbanColumns: KanbanColumn<BoardCardView>[] = columns.map((column) => ({
    id: column.status,
    title: columnLabel(column.status),
    cards: column.cards,
    summary: (
      <StageSummary
        visible={column.cards.length}
        stageCount={board.filtered ? column.stageCount : column.cards.length + column.hiddenCount}
        totals={column.stageTotals}
      />
    ),
    footer: <StageOverflowNote hidden={column.hiddenCount} />,
    ...(column.status === "CONTACTED"
      ? { collapsed: !showAwaiting, onToggleCollapsed: toggleAwaiting }
      : {}),
  }));

  const dialogCard = (kind: NonNullable<OpenDialog>["kind"]) =>
    dialog !== null && dialog.kind === kind ? dialog.card : null;
  const wonCard = dialogCard("won");
  const lostCard = dialogCard("lost");
  const empty = columns.every((column) => column.cards.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      <div className="md:hidden">
        {/* Always back on the placeholder, so the same stage can be chosen twice in a row. */}
        <Select
          aria-label="Jump to a stage"
          value=""
          placeholder="Jump to a stage"
          options={columns.map((column) => ({
            value: column.status,
            label: columnLabel(column.status),
          }))}
          onChange={(e) => {
            jumpToColumn(e.target.value);
          }}
        />
      </div>

      {empty && (
        <EmptyState
          title={board.filtered ? "No leads match these filters" : "No leads in the pipeline yet"}
          description={
            board.filtered
              ? "Clear a filter to see more of the pipeline."
              : "Leads appear here once they have been contacted."
          }
          action={
            <ButtonLink href={leadsPath} variant="secondary">
              View all leads
            </ButtonLink>
          }
        />
      )}

      <KanbanBoard
        label="Pipeline stages"
        columns={kanbanColumns}
        cardLabel={(card) => card.companyName}
        canDrag={(card) => card.canMove}
        onDrop={onDrop}
        renderCard={(card, handle) => (
          <PipelineCardBody
            card={card}
            handle={handle}
            href={leadHref(card)}
            timezone={timezone}
            moveTargets={card.canMove ? (board.allowedMoves[card.status] ?? []) : []}
            onOpen={(opened) => {
              setParams({ lead: opened.id }, { push: true });
            }}
            onSetNextAction={(target) => {
              setDialog({ kind: "nextAction", card: target });
            }}
            onMove={attempt}
          />
        )}
      />

      {wonCard !== null && (
        <WonDialog
          open
          onOpenChange={closeDialog}
          leadId={wonCard.id}
          companyName={wonCard.companyName}
          serviceLine={serviceLine}
          currencies={MARKET_CURRENCIES[wonCard.market]}
          proposals={wonCard.proposals}
          onDone={() => {
            moveCard(wonCard.id, "WON");
            setAnnouncement(`${wonCard.companyName} moved to Won.`);
            router.refresh();
          }}
        />
      )}
      {lostCard !== null && (
        <LostDialog
          open
          onOpenChange={closeDialog}
          leadId={lostCard.id}
          companyName={lostCard.companyName}
          onDone={() => {
            moveCard(lostCard.id, "LOST");
            setAnnouncement(`${lostCard.companyName} moved to Lost.`);
            router.refresh();
          }}
        />
      )}

      <MeetingMoveDialog
        card={dialogCard("meeting")}
        timezone={timezone}
        onOpenChange={closeDialog}
        onConfirm={async (card, input) => {
          const result = await moveToMeetingAction(card.id, input);
          if (result.ok) settle(card, "MEETING_BOOKED", "Meeting logged.");
          return result;
        }}
      />

      <UntilMoveDialog
        card={dialogCard("nurture")}
        timezone={timezone}
        onOpenChange={closeDialog}
        title={(card) => `Move ${card.companyName} to nurture`}
        description="Scheduled messages are cancelled and outreach stops. The follow-up date becomes the next action."
        dateLabel="Follow up on"
        noteLabel="Note"
        confirmLabel="Move to nurture"
        onConfirm={async (card, until, note) => {
          const result = await moveToNurtureAction(card.id, until, note);
          if (result.ok) settle(card, "NURTURE", "Lead moved to nurture.");
          return result;
        }}
      />

      <UntilMoveDialog
        card={dialogCard("nextAction")}
        timezone={timezone}
        prefill
        onOpenChange={closeDialog}
        title={(card) => `Next action for ${card.companyName}`}
        description="Set when this lead needs attention next, and what needs to happen."
        dateLabel="When"
        noteLabel="What needs to happen"
        confirmLabel="Save next action"
        onConfirm={async (card, at, note) => {
          const result = await setNextActionAction(card.id, at, note);
          if (result.ok) {
            toast.success("Next action saved.");
            router.refresh();
          }
          return result;
        }}
      />

      <ProposalHintDialog
        card={dialogCard("proposal")}
        onOpenChange={closeDialog}
        leadHref={leadHref}
      />

      <LeadSheet
        sheet={sheet}
        timezone={timezone}
        onClose={() => {
          setParams({ lead: null });
        }}
      />
    </div>
  );
}
