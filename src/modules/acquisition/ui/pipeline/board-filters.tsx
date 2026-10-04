"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import type { Currency } from "@/contracts/common";
import { FilterBar, Select, UrlSelect, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { UrlToggle } from "../leads/url-toggle";
import { useUrlParams } from "../leads/use-url-params";

/** Board filters, all in the URL: market, owner, a value range in one currency, overdue, stale. */

const MARKET_OPTIONS: SelectOption[] = [
  { value: "NIGERIA", label: "Nigeria" },
  { value: "INTERNATIONAL", label: "International" },
];

const CURRENCIES: Currency[] = ["NGN", "USD", "GBP", "EUR"];
const VALUE_CURRENCY_OPTIONS: SelectOption[] = [
  { value: "", label: "Any value" },
  ...CURRENCIES.map((currency) => ({ value: currency, label: currency })),
];

/** One end of the value range. It is applied when the field is left, or on Enter. */
function AmountInput({
  paramKey,
  label,
  placeholder,
}: {
  paramKey: "valueMin" | "valueMax";
  label: string;
  placeholder: string;
}) {
  const searchParams = useSearchParams();
  const setParams = useUrlParams();
  const current = searchParams.get(paramKey) ?? "";

  return (
    <Input
      // Keyed by the URL value, so "Clear" and the back button reset what the field shows.
      key={current}
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      defaultValue={current}
      onBlur={(e) => {
        const next = e.target.value.trim();
        // Tabbing through the field without changing it must not navigate and reload the board.
        if (next !== current) setParams({ [paramKey]: next === "" ? null : next });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="min-w-0 flex-1 font-mono sm:w-28 sm:flex-none"
    />
  );
}

function ValueRange() {
  const searchParams = useSearchParams();
  const setParams = useUrlParams();
  const currency = searchParams.get("valueCurrency") ?? "";

  return (
    <fieldset className="flex min-w-0 flex-col gap-1 text-sm">
      <legend className="text-xs font-medium text-muted">Estimated value</legend>
      {/* The currency takes its own row on a phone; the two amounts share the next one. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-36">
          <Select
            aria-label="Value currency"
            value={currency}
            options={VALUE_CURRENCY_OPTIONS}
            onChange={(e) => {
              setParams(
                e.target.value === ""
                  ? { valueCurrency: null, valueMin: null, valueMax: null }
                  : { valueCurrency: e.target.value },
              );
            }}
          />
        </div>
        {currency !== "" && (
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <AmountInput paramKey="valueMin" label="Minimum value" placeholder="Min" />
            <span aria-hidden className="text-muted">
              –
            </span>
            <AmountInput paramKey="valueMax" label="Maximum value" placeholder="Max" />
          </div>
        )}
      </div>
    </fieldset>
  );
}

export function BoardFilterBar({ owners, basePath }: { owners: SelectOption[]; basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasFilters = [...searchParams.keys()].some((key) => key !== "lead");

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <UrlSelect
          paramKey="market"
          label="Market"
          options={MARKET_OPTIONS}
          allLabel="All markets"
        />
        <UrlSelect paramKey="owner" label="Owner" options={owners} allLabel="Any owner" />
        <ValueRange />
      </FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <UrlToggle paramKey="overdue" label="Overdue only" />
        <UrlToggle paramKey="stale" label="Stale only" />
        <UrlToggle paramKey="nurture" label="Nurture lane" />
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              router.replace(basePath, { scroll: false });
            }}
          >
            <X aria-hidden className="size-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
