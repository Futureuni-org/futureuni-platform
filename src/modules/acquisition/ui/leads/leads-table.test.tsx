import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeadsTable, type LeadRowView } from "./leads-table";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function row(
  overrides: Partial<LeadRowView> & Pick<LeadRowView, "id" | "companyName">,
): LeadRowView {
  return {
    href: `/acquisition/web-development/leads/${overrides.id}`,
    city: "Lagos",
    country: "NG",
    market: "NIGERIA",
    status: "CONTACTED",
    score: 72,
    scoreBand: "QUALIFIED",
    strongestFinding: "Largest Contentful Paint is 7.2s on mobile",
    owner: { id: "u1", name: "Ada", image: null },
    lastActivityAt: "2026-10-01T09:00:00Z",
    nextActionAt: null,
    nextActionNote: null,
    overdue: false,
    source: "serpapi",
    needsHumanReview: false,
    complianceReview: false,
    inCrossSellGroup: false,
    ...overrides,
  };
}

const rows: LeadRowView[] = [
  row({ id: "c1", companyName: "Acme", source: "serpapi" }),
  row({ id: "c2", companyName: "Globex", source: "adzuna", score: 40, scoreBand: "BELOW" }),
];

/** The first match, failing the test clearly when there is none. */
function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("Expected at least one match.");
  return item;
}

function setup() {
  const onToggle = vi.fn();
  const onToggleAll = vi.fn();
  render(
    <LeadsTable
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      timezone="Africa/Lagos"
    />,
  );
  return { onToggle, onToggleAll };
}

describe("LeadsTable", () => {
  it("toggles a single lead by its labelled checkbox", async () => {
    const { onToggle } = setup();
    await userEvent.click(first(screen.getAllByRole("checkbox", { name: /select acme/i })));
    expect(onToggle).toHaveBeenCalledWith("c1");
  });

  it("selects every lead from the header checkbox", async () => {
    const { onToggleAll } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /select all leads/i }));
    expect(onToggleAll).toHaveBeenCalledWith(["c1", "c2"], true);
  });

  it("links each company to its lead detail", () => {
    setup();
    expect(screen.getAllByRole("link", { name: "Acme" })[0]).toHaveAttribute(
      "href",
      "/acquisition/web-development/leads/c1",
    );
  });

  it("navigates to the lead when a non-interactive cell is clicked", async () => {
    setup();
    await userEvent.click(first(screen.getAllByText("serpapi")));
    expect(push).toHaveBeenCalledWith("/acquisition/web-development/leads/c1");
  });
});
