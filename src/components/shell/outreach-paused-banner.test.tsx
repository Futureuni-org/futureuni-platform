/**
 * Phase 20 (COMP-3): the global outreach kill-switch banner shows only when paused.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OutreachPausedBanner } from "./outreach-paused-banner";

describe("OutreachPausedBanner", () => {
  it("renders a status banner when outreach is paused", () => {
    render(<OutreachPausedBanner paused />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Outreach is paused platform-wide");
    expect(banner).toHaveTextContent("No emails are sent");
  });

  it("renders nothing when not paused", () => {
    const { container } = render(<OutreachPausedBanner paused={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
