import "server-only";

import { Money } from "@/components/ui/money";
import type { Currency } from "@/contracts/common";
import { db } from "@/platform/db";

import type { WidgetProps } from "../widget-registry";

/**
 * Placeholder widget: sums pipeline value from Proposal rows the user owns, grouped by currency
 * (INV-11 — never across). Phase 19 replaces it with the acquisition pipeline service.
 */
export async function AcquisitionPipelineValueWidget({ user }: WidgetProps) {
  const rows = await db.proposal.findMany({
    where: {
      createdById: user.id,
      status: { in: ["APPROVED", "SENT", "ACCEPTED"] },
    },
    select: { totalMinor: true, currency: true },
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No open proposals — pipeline value will show here once you send one.
      </p>
    );
  }

  const totals = new Map<Currency, bigint>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0n) + BigInt(row.totalMinor));
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {Array.from(totals.entries()).map(([currency, amount]) => (
        <li key={currency} className="flex items-baseline justify-between gap-4">
          <span className="text-muted">Open in {currency}</span>
          <Money
            value={{ amountMinor: Number(amount), currency }}
            className="text-lg font-semibold text-heading"
          />
        </li>
      ))}
    </ul>
  );
}
