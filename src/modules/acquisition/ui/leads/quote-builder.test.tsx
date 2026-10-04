import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ok } from "@/lib/result";

import type { PackageOption, QuotePreview } from "./detail-types";
import { QuoteBuilder, type QuoteSeed } from "./quote-builder";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PACKAGES: PackageOption[] = [
  {
    id: "starter_site",
    name: "Starter site",
    minMinor: 80_000_000,
    typicalMinor: 120_000_000,
    maxMinor: 200_000_000,
    currency: "NGN",
  },
];

/**
 * A server answer no client formula could reproduce: the subtotal, discount and total don't add up
 * to each other. If the builder shows exactly these figures, they came from the server.
 */
const SERVER_QUOTE: QuotePreview = {
  currency: "NGN",
  lines: [
    {
      packageId: "starter_site",
      description: "Starter site",
      quantity: 1,
      unitPriceMinor: 120_000_000,
      totalMinor: 123_456_700,
    },
  ],
  subtotalMinor: 111_111_100,
  discountMinor: 22_222_200,
  taxMinor: 0,
  totalMinor: 99_999_900,
  requiresApproval: true,
  approvalReasons: ["The discount is 20%, above the 10% limit."],
};

function setup(
  overrides: { quote?: QuotePreview; canApproveException?: boolean; seed?: QuoteSeed } = {},
) {
  const priceQuote = vi.fn(() => Promise.resolve(ok(overrides.quote ?? SERVER_QUOTE)));
  const onSave = vi.fn(() =>
    Promise.resolve(ok({ proposalId: "cprop12345678", version: 1, requiresApproval: true })),
  );
  const onSaved = vi.fn();
  render(
    <QuoteBuilder
      leadId="clead12345678"
      packages={PACKAGES}
      currency="NGN"
      {...(overrides.seed === undefined ? {} : { seed: overrides.seed })}
      saveLabel="Generate proposal"
      canApproveException={overrides.canApproveException ?? false}
      priceQuote={priceQuote}
      onSave={onSave}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  const totals = screen.getByRole("complementary", { name: /quote totals/i });
  return { priceQuote, onSave, onSaved, totals };
}

describe("QuoteBuilder", () => {
  it("asks for a selection before pricing anything", () => {
    const { priceQuote, totals } = setup();
    expect(within(totals).getByText(/pick a package or add a line item/i)).toBeInTheDocument();
    expect(priceQuote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Generate proposal" })).toBeDisabled();
  });

  it("shows exactly the totals the server returned", async () => {
    const { priceQuote, totals } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));

    await waitFor(() => {
      expect(priceQuote).toHaveBeenCalledWith(
        "clead12345678",
        expect.objectContaining({
          packages: [{ packageId: "starter_site", quantity: 1 }],
          discount: { type: "NONE" },
        }),
      );
    });

    // Every figure is the server's, including ones that don't reconcile with each other.
    expect(await within(totals).findByText("₦999,999")).toBeInTheDocument();
    expect(within(totals).getByText("₦1,111,111")).toBeInTheDocument();
    expect(within(totals).getByText("₦222,222")).toBeInTheDocument();
    expect(within(totals).getByText("₦1,234,567")).toBeInTheDocument();
  });

  it("says when manager approval is needed, and why", async () => {
    const { totals } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));

    const notice = await within(totals).findByRole("status");
    expect(notice).toHaveTextContent("Manager approval needed");
    expect(notice).toHaveTextContent("The discount is 20%, above the 10% limit.");
    expect(notice).toHaveTextContent("A manager or admin must approve it before it can be sent.");
  });

  it("tells an approver they can approve it themselves", async () => {
    const { totals } = setup({ canApproveException: true });
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));
    expect(await within(totals).findByRole("status")).toHaveTextContent(
      "You can approve it once it is saved.",
    );
  });

  it("shows no approval notice when the quote is within limits", async () => {
    const { totals } = setup({
      quote: { ...SERVER_QUOTE, requiresApproval: false, approvalReasons: [] },
    });
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));
    await within(totals).findByText("₦999,999");
    expect(within(totals).queryByRole("status")).not.toBeInTheDocument();
  });

  it("re-prices on the server when a discount is added", async () => {
    const { priceQuote } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));
    await waitFor(() => {
      expect(priceQuote).toHaveBeenCalledTimes(1);
    });

    await userEvent.selectOptions(screen.getByLabelText("Discount"), "PERCENT");
    await userEvent.type(screen.getByLabelText("Discount percentage"), "20");

    await waitFor(() => {
      expect(priceQuote).toHaveBeenLastCalledWith(
        "clead12345678",
        expect.objectContaining({ discount: { type: "PERCENT", valueBps: 2000 } }),
      );
    });
  });

  it("saves the same inputs it priced", async () => {
    const { onSave, onSaved, totals } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));
    await within(totals).findByText("₦999,999");

    await userEvent.click(screen.getByRole("button", { name: "Generate proposal" }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ packages: [{ packageId: "starter_site", quantity: 1 }] }),
    );
  });

  it("starts a revision from the version's own lines, discount, date and notes", async () => {
    const { priceQuote, onSave, totals } = setup({
      seed: {
        lines: [
          {
            packageId: "starter_site",
            description: "Starter site",
            quantity: 2,
            unitPriceMinor: 110_000_000,
            totalMinor: 220_000_000,
          },
        ],
        discount: { type: "PERCENT", valueBps: 1250 },
        validUntil: "2026-11-15T00:00:00.000Z",
        notes: "Agreed on the call.",
      },
    });

    expect(screen.getByRole("checkbox", { name: /starter site/i })).toBeChecked();
    expect(screen.getByLabelText("Discount")).toHaveValue("PERCENT");
    expect(screen.getByLabelText("Discount percentage")).toHaveValue("12.5");
    expect(screen.getByLabelText("Valid until")).toHaveValue("2026-11-15");
    expect(screen.getByLabelText("Notes for the proposal")).toHaveValue("Agreed on the call.");

    // It is priced as it stood, without the person re-entering the discount.
    await waitFor(() => {
      expect(priceQuote).toHaveBeenCalledWith(
        "clead12345678",
        expect.objectContaining({
          packages: [{ packageId: "starter_site", quantity: 2, unitPriceMinor: 110_000_000 }],
          discount: { type: "PERCENT", valueBps: 1250 },
        }),
      );
    });

    await within(totals).findByText("₦999,999");
    await userEvent.click(screen.getByRole("button", { name: "Generate proposal" }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: { type: "PERCENT", valueBps: 1250 },
          validUntil: "2026-11-15T00:00:00.000Z",
          notes: "Agreed on the call.",
        }),
      );
    });
  });

  it("says so when a typed amount can't be read", async () => {
    setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /starter site/i }));
    const price = screen.getByLabelText("Unit price for Starter site");
    await userEvent.clear(price);
    await userEvent.type(price, "abc");
    expect(await screen.findByText(/enter an amount in figures/i)).toBeInTheDocument();
    expect(price).toHaveAttribute("aria-invalid", "true");
  });
});
