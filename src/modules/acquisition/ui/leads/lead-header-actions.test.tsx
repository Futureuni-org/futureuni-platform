import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LeadStatus } from "@/contracts/common";

import type { DetailCapabilities } from "./detail-types";
import { canReauditIn, canRescoreIn, primaryActions, secondaryActions } from "./lead-actions";
import { LeadHeaderActions } from "./lead-header-actions";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The header only needs the actions to exist; none is invoked by these tests.
vi.mock("./detail-actions", () => ({
  disqualifyAction: vi.fn(),
  nurtureAction: vi.fn(),
  reauditAction: vi.fn(),
  reengageAction: vi.fn(),
  rescoreAction: vi.fn(),
  snoozeAction: vi.fn(),
  markWonAction: vi.fn(),
  markLostAction: vi.fn(),
}));
vi.mock("./actions", () => ({ bulkSuppressAction: vi.fn() }));

const ALL: DetailCapabilities = {
  update: true,
  assign: true,
  rescore: true,
  reaudit: true,
  disqualify: true,
  dismissFinding: true,
  decideReview: true,
  sendOneOff: true,
  manageMeetings: true,
  createProposal: true,
  approveProposal: true,
  approveException: true,
  sendProposal: true,
  closeDeal: true,
  assignHandoff: true,
  suppress: true,
  dataRequest: true,
  seeCosts: true,
};
const NONE: DetailCapabilities = Object.fromEntries(
  Object.keys(ALL).map((key) => [key, false]),
) as unknown as DetailCapabilities;

function renderHeader(status: LeadStatus, capabilities: DetailCapabilities = ALL) {
  render(
    <LeadHeaderActions
      leadId="c1abcdefghij"
      companyName="Acme"
      status={status}
      serviceLine="WEB_DEVELOPMENT"
      capabilities={capabilities}
      detailPath="/acquisition/web-development/leads/c1abcdefghij"
      reviewHref="/acquisition/web-development/review?lead=c1abcdefghij"
      bookingLink="https://cal.example/acme"
      currencies={["NGN"]}
      proposals={[]}
      timezone="Africa/Lagos"
    />,
  );
}

describe("status-driven lead actions", () => {
  it("offers 'Draft outreach' for a scored lead, linking to the review queue", () => {
    renderHeader("SCORED");
    expect(screen.getByRole("link", { name: "Draft outreach" })).toHaveAttribute(
      "href",
      "/acquisition/web-development/review?lead=c1abcdefghij",
    );
    expect(screen.queryByRole("button", { name: "Mark won" })).not.toBeInTheDocument();
  });

  it("offers booking and a proposal for a replied lead", () => {
    renderHeader("REPLIED");
    expect(screen.getByRole("button", { name: /book meeting/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create proposal" })).toHaveAttribute(
      "href",
      "/acquisition/web-development/leads/c1abcdefghij?tab=proposals&new=1",
    );
  });

  it("offers won and lost once a proposal is sent", () => {
    renderHeader("PROPOSAL_SENT");
    expect(screen.getByRole("button", { name: "Mark won" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark lost" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Draft outreach" })).not.toBeInTheDocument();
  });

  it("opens the won dialog with the value, services and start date", async () => {
    renderHeader("PROPOSAL_SENT");
    await userEvent.click(screen.getByRole("button", { name: "Mark won" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mark Acme won");
    expect(screen.getByLabelText(/deal value/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Web Development")).toBeChecked();
    // The value is required before the lead can be closed.
    expect(screen.getAllByRole("button", { name: "Mark won" }).at(-1)).toBeDisabled();
  });

  it("requires a reason before a lead can be marked lost", async () => {
    renderHeader("PROPOSAL_SENT");
    await userEvent.click(screen.getByRole("button", { name: "Mark lost" }));
    await screen.findByRole("dialog");
    const confirm = screen.getAllByRole("button", { name: "Mark lost" }).at(-1);
    expect(confirm).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText(/reason/i), "PRICE");
    expect(confirm).toBeEnabled();
  });

  it("shows no primary actions on a closed lead", () => {
    renderHeader("WON");
    expect(
      screen.queryByRole("button", { name: /mark won|mark lost|book meeting/i }),
    ).not.toBeInTheDocument();
  });

  it("hides what the user isn't permitted to do", () => {
    renderHeader("PROPOSAL_SENT", NONE);
    expect(screen.queryByRole("button", { name: "Mark won" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
  });
});

describe("lead action rules", () => {
  it("follows the allowed transitions for primary actions", () => {
    expect(primaryActions("SCORED", ALL)).toEqual(["draftOutreach"]);
    expect(primaryActions("REPLIED", ALL)).toEqual(["bookMeeting", "createProposal", "markLost"]);
    expect(primaryActions("MEETING_BOOKED", ALL)).toEqual([
      "createProposal",
      "markWon",
      "markLost",
    ]);
    expect(primaryActions("NURTURE", ALL)).toEqual(["reengage", "markLost"]);
    expect(primaryActions("NEW", ALL)).toEqual([]);
    expect(primaryActions("LOST", ALL)).toEqual([]);
  });

  it("snoozes before contact and nurtures after it", () => {
    expect(secondaryActions("SCORED", ALL)).toContain("snooze");
    expect(secondaryActions("SCORED", ALL)).not.toContain("nurture");
    expect(secondaryActions("REPLIED", ALL)).toContain("nurture");
    expect(secondaryActions("REPLIED", ALL)).not.toContain("snooze");
  });

  it("only disqualifies where the transition is allowed", () => {
    expect(secondaryActions("SCORED", ALL)).toContain("disqualify");
    expect(secondaryActions("NURTURE", ALL)).toContain("disqualify");
    expect(secondaryActions("REPLIED", ALL)).not.toContain("disqualify");
    expect(secondaryActions("WON", ALL)).not.toContain("suppress");
  });

  it("offers a re-audit only where the audit run would do something", () => {
    for (const status of ["ENRICHED", "AUDITING", "AUDITED"] as const) {
      expect(canReauditIn(status)).toBe(true);
      expect(secondaryActions(status, ALL)).toContain("reaudit");
    }
    // Before enrichment there is nothing to audit; after scoring the run returns without auditing.
    for (const status of ["NEW", "ENRICHING", "SCORED", "CONTACTED", "REPLIED", "WON"] as const) {
      expect(canReauditIn(status)).toBe(false);
      expect(secondaryActions(status, ALL)).not.toContain("reaudit");
    }
  });

  it("offers a re-score only where the scoring service would score", () => {
    for (const status of ["AUDITED", "SCORED", "NURTURE", "CONTACTED", "REPLIED"] as const) {
      expect(canRescoreIn(status)).toBe(true);
      expect(secondaryActions(status, ALL)).toContain("rescore");
    }
    // A lead in review or approved is left alone by the scoring service, as is a closed one.
    for (const status of ["NEW", "ENRICHED", "IN_REVIEW", "APPROVED", "WON", "LOST"] as const) {
      expect(canRescoreIn(status)).toBe(false);
      expect(secondaryActions(status, ALL)).not.toContain("rescore");
    }
  });

  it("offers the data-request link only to someone who handles data requests", () => {
    expect(secondaryActions("SCORED", ALL)).toContain("dataRequest");
    expect(secondaryActions("SCORED", { ...ALL, dataRequest: false })).not.toContain("dataRequest");
  });
});
