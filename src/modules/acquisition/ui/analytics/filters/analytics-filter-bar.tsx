"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The line-analytics filter bar (Phase 17; B3.8 URL-driven). Writes `range`, `from`, `to`, `market`,
 * `compare`, `source` and `owner` to the URL so a view is shareable, using `next/navigation`
 * directly (the project's established convention; nuqs is not mounted — see REQUESTS.md). Every
 * control is a 48px target with an accessible label.
 */

const RANGE_OPTIONS: SelectOption[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom range" },
];

const MARKET_OPTIONS: SelectOption[] = [
  { value: "", label: "Both markets" },
  { value: "NIGERIA", label: "Nigeria" },
  { value: "INTERNATIONAL", label: "International" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[9rem] flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function AnalyticsFilterBar({
  sources,
  owners,
  className,
}: {
  sources: SelectOption[];
  owners: SelectOption[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const range = params.get("range") ?? "30d";
  const market = params.get("market") ?? "";
  const compareOn = params.get("compare") === "previous_period";
  const source = params.get("source") ?? "";
  const owner = params.get("owner") ?? "";

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end", className)}>
      <Field label="Date range">
        <Select
          aria-label="Date range"
          value={range}
          options={RANGE_OPTIONS}
          onChange={(e) => {
            // Leaving custom clears the explicit dates.
            setParams(
              e.target.value === "custom"
                ? { range: "custom" }
                : { range: e.target.value, from: null, to: null },
            );
          }}
        />
      </Field>

      {range === "custom" && (
        <>
          <Field label="From">
            <input
              type="date"
              aria-label="From date"
              value={params.get("from") ?? ""}
              onChange={(e) => { setParams({ from: e.target.value || null }); }}
              className="h-12 rounded-md border border-input bg-surface px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              aria-label="To date"
              value={params.get("to") ?? ""}
              onChange={(e) => { setParams({ to: e.target.value || null }); }}
              className="h-12 rounded-md border border-input bg-surface px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
        </>
      )}

      <Field label="Market">
        <Select
          aria-label="Market"
          value={market}
          options={MARKET_OPTIONS}
          onChange={(e) => { setParams({ market: e.target.value || null }); }}
        />
      </Field>

      {sources.length > 0 && (
        <Field label="Source">
          <Select
            aria-label="Source"
            value={source}
            options={[{ value: "", label: "All sources" }, ...sources]}
            onChange={(e) => { setParams({ source: e.target.value || null }); }}
          />
        </Field>
      )}

      {owners.length > 0 && (
        <Field label="Owner">
          <Select
            aria-label="Owner"
            value={owner}
            options={[{ value: "", label: "All owners" }, ...owners]}
            onChange={(e) => { setParams({ owner: e.target.value || null }); }}
          />
        </Field>
      )}

      <Button
        type="button"
        variant={compareOn ? "primary" : "secondary"}
        aria-pressed={compareOn}
        onClick={() => { setParams({ compare: compareOn ? null : "previous_period" }); }}
      >
        Compare to previous
      </Button>
    </div>
  );
}
