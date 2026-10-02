import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiffView } from "./diff-view";
import type { ProfileDiff } from "@/modules/acquisition/profiles";

describe("DiffView (publish diff rendering)", () => {
  it("renders added, removed and modified entries with their paths", () => {
    const diff: ProfileDiff = {
      hasChanges: true,
      entries: [
        { path: "scoring.rules.no_website", kind: "modified", before: { points: 20 }, after: { points: 25 } },
        { path: "signals.new_signal", kind: "added", after: { id: "new_signal" } },
        { path: "signals.old_signal", kind: "removed", before: { id: "old_signal" } },
      ],
    };
    render(<DiffView diff={diff} />);
    expect(screen.getByText("scoring.rules.no_website")).toBeInTheDocument();
    expect(screen.getByText("added")).toBeInTheDocument();
    expect(screen.getByText("removed")).toBeInTheDocument();
    expect(screen.getByText("modified")).toBeInTheDocument();
  });

  it("says so when there are no changes", () => {
    render(<DiffView diff={{ hasChanges: false, entries: [] }} />);
    expect(screen.getByText(/no changes/i)).toBeInTheDocument();
  });
});
