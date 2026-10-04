import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { err, ok } from "@/lib/result";
import { AppError } from "@/lib/errors";

import { UNREACHABLE } from "./action-failure";
import { moveToConversationAction } from "./actions";
import type { BoardCardView, BoardColumnView, BoardView } from "./board-types";
import type { KanbanColumn, RenderKanbanCard } from "./kanban-board";
import { PipelineBoard } from "./pipeline-board";

const refresh = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/acquisition/web-development/pipeline",
  useSearchParams: () => new URLSearchParams(),
  // Passes a framework redirect on and does nothing for an ordinary error, as the real one does.
  unstable_rethrow: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/motion", () => ({ useReducedMotionSafe: () => true }));
vi.mock("./actions", () => ({
  moveToConversationAction: vi.fn(),
  moveToMeetingAction: vi.fn(),
  moveToNurtureAction: vi.fn(),
  boardBookingLinkAction: vi.fn(),
}));
vi.mock("../leads/detail-actions", () => ({
  setNextActionAction: vi.fn(),
  markWonAction: vi.fn(),
  markLostAction: vi.fn(),
}));

/**
 * Real dragging needs layout, which jsdom doesn't have. This stand-in keeps the board's contract
 * (columns with their summary and footer, cards, and "this card was dropped on that column") and
 * offers each drop as a button, so the tests exercise the board's own drop handling.
 */
vi.mock("./kanban-board", () => ({
  KanbanBoard: ({
    columns,
    renderCard,
    onDrop,
  }: {
    columns: KanbanColumn<BoardCardView>[];
    renderCard: RenderKanbanCard<BoardCardView>;
    onDrop: (drop: { cardId: string; from: string; to: string }) => void;
  }) => (
    <div>
      {columns.map((column) => (
        <section key={column.id} aria-label={column.title}>
          {column.summary}
          {column.footer}
          {column.cards.map((card) => (
            <div key={card.id}>
              {renderCard(card, null)}
              {columns.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => {
                    onDrop({ cardId: card.id, from: column.id, to: target.id });
                  }}
                >
                  {`drop ${card.companyName} on ${target.title}`}
                </button>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
}));

function card(
  overrides: Partial<BoardCardView> & Pick<BoardCardView, "id" | "status" | "companyName">,
): BoardCardView {
  return {
    contactName: "Ada Obi",
    ownerName: "Tunde",
    market: "NIGERIA",
    daysInStage: 3,
    nextActionAt: null,
    nextActionNote: null,
    overdue: false,
    stale: false,
    estimatedValue: { amountMinor: 120_000_000, currency: "NGN" },
    canMove: true,
    proposals: [],
    hasProposal: false,
    ...overrides,
  };
}

function column(status: BoardColumnView["status"], cards: BoardCardView[]): BoardColumnView {
  return { status, cards, hiddenCount: 0, stageCount: cards.length, stageTotals: {} };
}

function board(
  overrides: Partial<Record<BoardColumnView["status"], BoardCardView[]>> = {},
): BoardView {
  const cards: Partial<Record<BoardColumnView["status"], BoardCardView[]>> = {
    REPLIED: [card({ id: "c1", status: "REPLIED", companyName: "Acme" })],
    MEETING_BOOKED: [card({ id: "c2", status: "MEETING_BOOKED", companyName: "Globex" })],
    PROPOSAL_SENT: [card({ id: "c3", status: "PROPOSAL_SENT", companyName: "Initech" })],
    ...overrides,
  };
  return {
    columns: (
      ["CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST"] as const
    ).map((status) => column(status, cards[status] ?? [])),
    nurture: column("NURTURE", []),
    allowedMoves: {
      CONTACTED: ["REPLIED", "MEETING_BOOKED", "LOST", "NURTURE"],
      REPLIED: ["MEETING_BOOKED", "PROPOSAL_SENT", "LOST", "NURTURE"],
      MEETING_BOOKED: ["REPLIED", "PROPOSAL_SENT", "WON", "LOST", "NURTURE"],
      PROPOSAL_SENT: ["REPLIED", "WON", "LOST", "NURTURE"],
      WON: [],
      LOST: ["NURTURE"],
      NURTURE: ["REPLIED", "LOST"],
    },
    filtered: false,
  };
}

function renderBoard(view: BoardView = board()) {
  render(
    <PipelineBoard
      board={view}
      serviceLine="WEB_DEVELOPMENT"
      leadsPath="/acquisition/web-development/leads"
      timezone="Africa/Lagos"
      sheet={null}
      showNurture={false}
      showAwaiting
    />,
  );
}

// `hidden: true`: an open dialog hides the board behind it from the accessibility tree.
const stage = (name: string) => screen.getByRole("region", { name, hidden: true });
const drop = (company: string, target: string) =>
  userEvent.click(screen.getByRole("button", { name: `drop ${company} on ${target}` }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PipelineBoard drop rules", () => {
  it("opens the won dialog, and cancelling it leaves the card where it was", async () => {
    renderBoard();
    await drop("Initech", "Won");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mark Initech won");
    // Nothing has moved yet: the move only happens once the dialog is confirmed.
    expect(within(stage("Proposal sent")).getByText("Initech")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(within(stage("Proposal sent")).getByText("Initech")).toBeInTheDocument();
    expect(within(stage("Won")).queryByText("Initech")).not.toBeInTheDocument();
  });

  it("opens the lost dialog and requires a reason", async () => {
    renderBoard();
    await drop("Acme", "Lost");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mark Acme lost");
    expect(within(dialog).getByRole("button", { name: "Mark lost" })).toBeDisabled();
    expect(within(stage("Conversation")).getByText("Acme")).toBeInTheDocument();
  });

  it("snaps an invalid move back and explains why", async () => {
    renderBoard();
    await drop("Acme", "Won");

    expect(toast.error).toHaveBeenCalledWith("A lead can't move from Conversation to Won.");
    expect(screen.getByRole("status")).toHaveTextContent(
      "A lead can't move from Conversation to Won.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(stage("Conversation")).getByText("Acme")).toBeInTheDocument();
    expect(within(stage("Won")).queryByText("Acme")).not.toBeInTheDocument();
  });

  it("refuses a drop on proposal sent and offers to create a proposal", async () => {
    renderBoard();
    await drop("Acme", "Proposal sent");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Create proposal" })).toHaveAttribute(
      "href",
      "/acquisition/web-development/leads/c1?tab=proposals&new=1",
    );
    expect(within(stage("Conversation")).getByText("Acme")).toBeInTheDocument();
  });

  it("won't move a card the user doesn't own", async () => {
    renderBoard(
      board({
        REPLIED: [card({ id: "c1", status: "REPLIED", companyName: "Acme", canMove: false })],
      }),
    );
    await drop("Acme", "Lost");

    expect(toast.error).toHaveBeenCalledWith("You can only move leads you own.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves a card to conversation at once and keeps it there when the server agrees", async () => {
    vi.mocked(moveToConversationAction).mockResolvedValue(ok({ ok: true }));
    renderBoard();
    await drop("Globex", "Conversation");

    expect(within(stage("Conversation")).getByText("Globex")).toBeInTheDocument();
    expect(within(stage("Meeting booked")).queryByText("Globex")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(moveToConversationAction).toHaveBeenCalledWith("c2");
  });

  it("rolls the card back when the server rejects the move", async () => {
    vi.mocked(moveToConversationAction).mockResolvedValue(
      err(new AppError("INVALID_TRANSITION", "That move isn't allowed right now.")),
    );
    renderBoard();
    await drop("Globex", "Conversation");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("That move isn't allowed right now.");
    });
    expect(within(stage("Meeting booked")).getByText("Globex")).toBeInTheDocument();
    expect(within(stage("Conversation")).queryByText("Globex")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rolls the card back and says so when the request never reaches the server", async () => {
    vi.mocked(moveToConversationAction).mockRejectedValue(new TypeError("Failed to fetch"));
    renderBoard();
    await drop("Globex", "Conversation");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(UNREACHABLE);
    });
    expect(within(stage("Meeting booked")).getByText("Globex")).toBeInTheDocument();
    expect(within(stage("Conversation")).queryByText("Globex")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Globex was moved back.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PipelineBoard stage summary", () => {
  it("says how many leads a stage holds beyond the ones it lists", () => {
    const view = board();
    renderBoard({
      ...view,
      columns: view.columns.map((stageColumn) =>
        stageColumn.status === "REPLIED" ? { ...stageColumn, hiddenCount: 140 } : stageColumn,
      ),
    });

    const conversation = stage("Conversation");
    expect(conversation).toHaveTextContent("1 of 141");
    expect(conversation).toHaveTextContent("140 more leads are not shown.");
    // A stage that is shown in full has no such note.
    expect(stage("Meeting booked")).not.toHaveTextContent("not shown");
  });
});
