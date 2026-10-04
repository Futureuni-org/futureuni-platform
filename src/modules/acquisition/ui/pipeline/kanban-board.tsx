"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { ChevronsLeftRight, GripVertical } from "lucide-react";

import { useReducedMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * KanbanBoard — columns of draggable cards (Phase 4 deferred this composite; a Phase 16 candidate
 * for promotion). Built on dnd-kit:
 * - mouse dragging from anywhere on a card (an 8px threshold, so a click still clicks);
 * - touch dragging after a short press, so a swipe that starts on a card scrolls the board as it
 *   would anywhere else. Only the card's handle turns the browser's own touch scrolling off;
 * - keyboard dragging from the card's handle: Space or Enter picks a card up, Left and Right move
 *   it one column at a time, Space or Enter drops it, Escape cancels;
 * - screen-reader announcements for pick-up, move, drop and cancel.
 * The board only reports a drop. Whether the move is allowed, and what it needs first, is the
 * caller's decision; a card stays where it is until the caller moves it.
 */

export interface KanbanColumn<T> {
  id: string;
  title: string;
  cards: T[];
  /** Shown under the title: counts, totals. */
  summary?: ReactNode;
  /** Shown under the cards: for example, a note that the stage holds more than is listed. */
  footer?: ReactNode;
  /** A collapsed column is a narrow rail: its cards are hidden and nothing can be dropped on it. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * Renders one card. `handle` is the card's drag handle (null when the card can't be moved, and in
 * the copy that follows the pointer during a drag); the card places it where it fits its layout.
 */
export type RenderKanbanCard<T> = (card: T, handle: ReactNode) => ReactNode;

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "To move this card, press space or enter to pick it up. Use the left and right arrow keys to move it between stages, then press space or enter to drop it. Press escape to cancel.",
};

const ICON_BUTTON =
  "flex size-12 shrink-0 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Pointer position when there is one, otherwise overlap (keyboard dragging has no pointer). */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

/** Left and Right move the dragged card to the neighbouring column; other keys don't move it. */
const columnCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { collisionRect, droppableContainers, droppableRects } },
) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return undefined;
  event.preventDefault();
  if (collisionRect === null) return undefined;

  const columns = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect === undefined ? [] : [rect];
    })
    .sort((a, b) => a.left - b.left);
  if (columns.length === 0) return undefined;

  const centre = collisionRect.left + collisionRect.width / 2;
  let current = columns.findIndex((rect) => centre >= rect.left && centre <= rect.right);
  if (current === -1) {
    // Between columns: take the nearest one.
    current = columns.reduce(
      (best, rect, index) =>
        Math.abs(rect.left - centre) < Math.abs((columns[best]?.left ?? 0) - centre) ? index : best,
      0,
    );
  }
  const next = columns[current + (event.code === "ArrowRight" ? 1 : -1)];
  if (next === undefined) return undefined;
  return { x: next.left + 12, y: next.top + 12 };
};

function KanbanCard({
  id,
  label,
  draggable,
  children,
}: {
  id: string;
  label: string;
  draggable: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id,
    disabled: !draggable,
    attributes: { roleDescription: "draggable card" },
  });

  // `touch-none` belongs on the handle alone. On the whole card it would stop a finger that lands
  // on a card from scrolling the board, and on a phone the cards fill the screen.
  const handle = draggable ? (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      aria-label={`Move ${label}`}
      className={cn(ICON_BUTTON, "cursor-grab touch-none select-none active:cursor-grabbing")}
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  ) : null;

  return (
    <li
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      className={cn("rounded-lg bg-surface p-2 shadow-soft", isDragging && "opacity-40")}
    >
      {children(handle)}
    </li>
  );
}

function KanbanColumnView<T extends { id: string }>({
  column,
  renderCard,
  cardLabel,
  canDrag,
}: {
  column: KanbanColumn<T>;
  renderCard: RenderKanbanCard<T>;
  cardLabel: (card: T) => string;
  canDrag: (card: T) => boolean;
}) {
  const collapsed = column.collapsed === true;
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: collapsed });
  const headingId = `kanban-heading-${column.id}`;

  if (collapsed) {
    return (
      <section
        id={`kanban-col-${column.id}`}
        aria-labelledby={headingId}
        className="flex w-16 shrink-0 snap-start flex-col items-center gap-3 rounded-lg bg-zone px-2 py-3"
      >
        <button
          type="button"
          onClick={column.onToggleCollapsed}
          aria-label={`Expand ${column.title}`}
          className={ICON_BUTTON}
        >
          <ChevronsLeftRight aria-hidden className="size-4" />
        </button>
        <h2
          id={headingId}
          className="text-xs font-semibold text-heading [writing-mode:vertical-rl]"
        >
          {column.title}
        </h2>
        <span className="font-mono text-xs text-muted tabular-nums">
          {String(column.cards.length)}
        </span>
      </section>
    );
  }

  return (
    <section
      id={`kanban-col-${column.id}`}
      aria-labelledby={headingId}
      className="flex w-[85vw] shrink-0 snap-start flex-col gap-3 sm:w-72"
    >
      <header className="flex flex-col gap-1 px-1">
        {/* The same height with or without the collapse button, so every column's cards line up. */}
        <div className="flex min-h-12 items-center justify-between gap-2">
          <h2 id={headingId} className="font-semibold text-heading">
            {column.title}
          </h2>
          {column.onToggleCollapsed !== undefined && (
            <button
              type="button"
              onClick={column.onToggleCollapsed}
              aria-label={`Collapse ${column.title}`}
              className={ICON_BUTTON}
            >
              <ChevronsLeftRight aria-hidden className="size-4" />
            </button>
          )}
        </div>
        {column.summary}
      </header>
      <ul
        ref={setNodeRef}
        data-active={isOver ? "true" : undefined}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-lg bg-zone p-2 transition-colors",
          isOver && "reading-rule bg-primary-soft",
        )}
      >
        {column.cards.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">No leads in this stage</li>
        ) : (
          column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              id={card.id}
              label={cardLabel(card)}
              draggable={canDrag(card)}
            >
              {(handle) => renderCard(card, handle)}
            </KanbanCard>
          ))
        )}
      </ul>
      {column.footer}
    </section>
  );
}

export function KanbanBoard<T extends { id: string }>({
  columns,
  renderCard,
  cardLabel,
  canDrag,
  onDrop,
  label,
  className,
}: {
  columns: KanbanColumn<T>[];
  renderCard: RenderKanbanCard<T>;
  cardLabel: (card: T) => string;
  canDrag: (card: T) => boolean;
  /** A card was dropped on a different column. The card has not been moved. */
  onDrop: (drop: { cardId: string; from: string; to: string }) => void;
  label: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotionSafe();
  const [activeId, setActiveId] = useState<string | null>(null);
  // dnd-kit numbers its accessibility elements with a module-level counter, which differs between
  // the server render and the browser. A React id is the same on both, so hydration matches.
  const dndId = useId();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // A finger has to rest for a moment before a card is picked up. A swipe moves further than the
    // tolerance first, so it stays a scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  const { cardsById, columnOfCard, titleOfColumn } = useMemo(() => {
    const cards = new Map<string, T>();
    const columnByCard = new Map<string, string>();
    const titles = new Map<string, string>();
    for (const column of columns) {
      titles.set(column.id, column.title);
      for (const card of column.cards) {
        cards.set(card.id, card);
        columnByCard.set(card.id, column.id);
      }
    }
    return { cardsById: cards, columnOfCard: columnByCard, titleOfColumn: titles };
  }, [columns]);

  const announcements = useMemo((): Announcements => {
    const nameOf = (id: string | number) => {
      const card = cardsById.get(String(id));
      return card === undefined ? "the card" : cardLabel(card);
    };
    const stageOf = (id: string | number | undefined) =>
      id === undefined ? undefined : titleOfColumn.get(String(id));
    return {
      onDragStart: ({ active }) =>
        `Picked up ${nameOf(active.id)}. It is in ${stageOf(columnOfCard.get(String(active.id))) ?? "its stage"}.`,
      onDragOver: ({ active, over }) => {
        const stage = stageOf(over?.id);
        return stage === undefined
          ? `${nameOf(active.id)} is not over a stage.`
          : `${nameOf(active.id)} is over ${stage}.`;
      },
      onDragEnd: ({ active, over }) => {
        const stage = stageOf(over?.id);
        return stage === undefined
          ? `${nameOf(active.id)} was dropped back where it was.`
          : `${nameOf(active.id)} was dropped on ${stage}.`;
      },
      onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
    };
  }, [cardsById, columnOfCard, titleOfColumn, cardLabel]);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const cardId = String(event.active.id);
    const from = columnOfCard.get(cardId);
    const to = event.over === null ? undefined : String(event.over.id);
    if (from !== undefined && to !== undefined && from !== to) onDrop({ cardId, from, to });
  }

  const activeCard = activeId === null ? undefined : cardsById.get(activeId);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
      }}
    >
      <div
        role="group"
        aria-label={label}
        className={cn(
          // snap-proximity, not mandatory: a card is wider than a phone, and mandatory snapping
          // won't let a finger (or a test) rest between cards, so it fights scrolling to a card's
          // own controls. Proximity still snaps when a scroll ends near a column start.
          "flex snap-x snap-proximity gap-4 overflow-x-auto pb-4 lg:snap-none",
          className,
        )}
      >
        {columns.map((column) => (
          <KanbanColumnView
            key={column.id}
            column={column}
            renderCard={renderCard}
            cardLabel={cardLabel}
            canDrag={canDrag}
          />
        ))}
      </div>
      <DragOverlay {...(reducedMotion ? { dropAnimation: null } : {})}>
        {activeCard === undefined ? null : (
          <div className="rounded-lg bg-elevated p-2 shadow-lift">
            {renderCard(activeCard, null)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
