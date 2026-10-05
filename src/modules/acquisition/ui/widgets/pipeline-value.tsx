import "server-only";

import { Money } from "@/components/ui/money";
import type { Currency } from "@/contracts/common";
import type { CurrentUser } from "@/platform/auth";
import { getPipelineWidgetData } from "@/modules/acquisition/pipeline";

/**
 * "Pipeline value" home widget (Phase 19): open value per currency (never summed across, INV-11)
 * and the count of the viewer's meetings today, from the real pipeline service.
 */
export async function AcquisitionPipelineValueWidget({ user }: { user: CurrentUser }) {
  const { openByCurrency, meetingsToday } = await getPipelineWidgetData(user.id, {
    now: () => new Date(),
  });

  const entries = Object.entries(openByCurrency) as [Currency, number][];

  if (entries.length === 0 && meetingsToday === 0) {
    return (
      <p className="text-sm text-muted">
        No open proposals — pipeline value will show here once you send one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1 text-sm">
        {entries.length === 0 ? (
          <li className="text-muted">No open proposals yet.</li>
        ) : (
          entries.map(([currency, amount]) => (
            <li key={currency} className="flex items-baseline justify-between gap-4">
              <span className="text-muted">Open in {currency}</span>
              <Money
                value={{ amountMinor: amount, currency }}
                className="text-lg font-semibold text-heading"
              />
            </li>
          ))
        )}
      </ul>
      <p className="text-sm text-muted">
        <span className="font-mono tabular-nums text-foreground">{meetingsToday}</span>{" "}
        {meetingsToday === 1 ? "meeting" : "meetings"} today
      </p>
    </div>
  );
}
