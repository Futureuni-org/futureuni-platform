"use client";

import { Info } from "lucide-react";

import { MarketBadge } from "@/components/ui";
import { Tooltip } from "@/components/ui/tooltip";
import type { Market } from "@/contracts/common";

import type { SourceOption } from "./types";

/**
 * The source picker: the adapters that apply to this line and the chosen markets. Each shows its
 * market applicability and a one-line description; a disabled adapter shows why and can't be
 * selected (INV-14 — e.g. terms don't allow automated access).
 */

export function SourceSelect({
  options,
  selectedMarkets,
  value,
  onChange,
}: {
  options: SourceOption[];
  selectedMarkets: Market[];
  value: string[];
  onChange: (value: string[]) => void;
}): React.ReactElement {
  const applicable = options.filter((o) => o.markets.some((m) => selectedMarkets.includes(m)));

  function toggle(id: string, enabled: boolean): void {
    if (!enabled) return;
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  if (applicable.length === 0) {
    return <p className="text-sm text-muted">No sources apply to the selected market yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {applicable.map((option) => {
        const enabled = option.status === "ENABLED";
        const checked = value.includes(option.id) && enabled;
        return (
          <li key={option.id}>
            <label
              className={[
                "flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                enabled
                  ? "cursor-pointer border-border hover:bg-zone has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40"
                  : "cursor-not-allowed border-border bg-zone/60",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!enabled}
                onChange={() => {
                  toggle(option.id, enabled);
                }}
                style={{ accentColor: "var(--primary)" }}
                className="mt-0.5 size-4 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={enabled ? "text-sm font-semibold text-heading" : "text-sm font-semibold text-muted"}>
                    {option.label}
                  </span>
                  {option.markets.map((m) => (
                    <MarketBadge key={m} market={m} />
                  ))}
                  {!enabled ? (
                    <Tooltip label={option.disabledReason ?? "Disabled"}>
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                        <Info className="size-3" aria-hidden />
                        Disabled
                      </span>
                    </Tooltip>
                  ) : null}
                </span>
                <span className="text-xs text-muted">{option.description}</span>
                {!enabled && option.disabledReason !== null ? (
                  <span className="text-xs text-warning">{option.disabledReason}</span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
