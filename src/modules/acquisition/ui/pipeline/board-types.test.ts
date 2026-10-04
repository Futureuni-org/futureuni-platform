import { describe, expect, it } from "vitest";

import { dropOutcome, type BoardView } from "./board-types";

// The moves the transitions table allows between board stages (what the server passes down).
const ALLOWED: BoardView["allowedMoves"] = {
  CONTACTED: ["REPLIED", "MEETING_BOOKED", "LOST", "NURTURE"],
  REPLIED: ["MEETING_BOOKED", "PROPOSAL_SENT", "LOST", "NURTURE"],
  MEETING_BOOKED: ["REPLIED", "PROPOSAL_SENT", "WON", "LOST", "NURTURE"],
  PROPOSAL_SENT: ["REPLIED", "WON", "LOST", "NURTURE"],
  WON: [],
  LOST: ["NURTURE"],
  NURTURE: ["REPLIED", "LOST"],
};

const movable = (status: Parameters<typeof dropOutcome>[0]["status"]) => ({
  status,
  canMove: true,
});

describe("dropOutcome", () => {
  it("does nothing when a card is dropped on its own stage", () => {
    expect(dropOutcome(movable("REPLIED"), "REPLIED", ALLOWED)).toEqual({ kind: "none" });
  });

  it("opens the won and lost dialogs instead of moving straight away", () => {
    expect(dropOutcome(movable("PROPOSAL_SENT"), "WON", ALLOWED)).toEqual({
      kind: "dialog",
      dialog: "won",
    });
    expect(dropOutcome(movable("REPLIED"), "LOST", ALLOWED)).toEqual({
      kind: "dialog",
      dialog: "lost",
    });
  });

  it("asks for a meeting time before moving to meeting booked", () => {
    expect(dropOutcome(movable("REPLIED"), "MEETING_BOOKED", ALLOWED)).toEqual({
      kind: "dialog",
      dialog: "meeting",
    });
  });

  it("asks for a follow-up date before moving to nurture", () => {
    expect(dropOutcome(movable("CONTACTED"), "NURTURE", ALLOWED)).toEqual({
      kind: "dialog",
      dialog: "nurture",
    });
  });

  it("never moves a card to proposal sent; it offers the proposal flow", () => {
    expect(dropOutcome(movable("REPLIED"), "PROPOSAL_SENT", ALLOWED)).toEqual({
      kind: "dialog",
      dialog: "proposal",
    });
  });

  it("moves straight to conversation where the transition is allowed", () => {
    expect(dropOutcome(movable("MEETING_BOOKED"), "REPLIED", ALLOWED)).toEqual({
      kind: "move",
      to: "REPLIED",
    });
  });

  it("rejects a move the transitions table doesn't allow, and says why", () => {
    expect(dropOutcome(movable("REPLIED"), "WON", ALLOWED)).toEqual({
      kind: "invalid",
      message: "A lead can't move from Conversation to Won.",
    });
    expect(dropOutcome(movable("WON"), "REPLIED", ALLOWED)).toEqual({
      kind: "invalid",
      message: "A lead can't move from Won to Conversation.",
    });
    expect(dropOutcome(movable("REPLIED"), "CONTACTED", ALLOWED).kind).toBe("invalid");
  });

  it("rejects a move by someone who may not move the card", () => {
    expect(dropOutcome({ status: "REPLIED", canMove: false }, "LOST", ALLOWED)).toEqual({
      kind: "invalid",
      message: "You can only move leads you own.",
    });
  });
});
