"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Search, X } from "lucide-react";

import { FilterBar, Select, UrlDateInput, UrlSelect, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

import {
  LEAD_FILTER_KEYS,
  LEAD_FLAGS,
  MAX_SEARCH_LENGTH,
  STATUS_GROUP_OPTIONS,
  type LeadDateField,
  type LeadFlagKey,
} from "./lead-filters";
import { useUrlParams } from "./use-url-params";

const MARKET_OPTIONS: SelectOption[] = [
  { value: "NIGERIA", label: "Nigeria" },
  { value: "INTERNATIONAL", label: "International" },
];

const DATE_FIELD_OPTIONS: { value: LeadDateField; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "activity", label: "Last activity" },
];

const SEARCH_DELAY_MS = 300;
// How many of its own searches the box remembers, to tell them from a change made elsewhere.
const SENT_MEMORY = 5;

/**
 * The search box. What is typed goes to `?q=` after a short pause. The box also follows the URL:
 * when `q` changes for any other reason (a saved view, "Clear filters", the Back button) it shows
 * the new value, and a search that was waiting to be sent is dropped. A box that only read the URL
 * once would keep showing the old text over a list that no longer matches it, and send it again on
 * the next keystroke.
 */
function SearchInput() {
  const searchParams = useSearchParams();
  const setParam = useUrlParams();
  const urlValue = searchParams.get("q") ?? "";
  const [box, setBox] = useState<{ text: string; url: string; sent: readonly string[] }>({
    text: urlValue,
    url: urlValue,
    sent: [urlValue],
  });

  // The URL's `q` changed since the last render. If it is a value this box sent, the typing stands
  // (the person may have typed on since). Anything else came from outside, so the box takes it.
  if (box.url !== urlValue) {
    setBox(
      box.sent.includes(urlValue)
        ? { ...box, url: urlValue }
        : { text: urlValue, url: urlValue, sent: [urlValue] },
    );
  }

  const wanted = box.text.trim().slice(0, MAX_SEARCH_LENGTH);
  const lastSent = box.sent.at(-1);

  useEffect(() => {
    if (wanted === lastSent) return;
    const timer = setTimeout(() => {
      setBox((current) => ({
        ...current,
        sent: [...current.sent, wanted].slice(-SENT_MEMORY),
      }));
      setParam({ q: wanted === "" ? null : wanted });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [wanted, lastSent, setParam]);

  return (
    <div className="relative min-w-0 flex-1">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
      />
      <Input
        type="search"
        aria-label="Search leads"
        placeholder="Company, contact or domain"
        value={box.text}
        maxLength={MAX_SEARCH_LENGTH}
        onChange={(e) => {
          setBox((current) => ({ ...current, text: e.target.value }));
        }}
        className="pl-9"
      />
    </div>
  );
}

function ScoreInput({ paramKey, label }: { paramKey: "scoreMin" | "scoreMax"; label: string }) {
  const searchParams = useSearchParams();
  const setParam = useUrlParams();
  const current = searchParams.get(paramKey) ?? "";

  return (
    <Input
      type="number"
      min={0}
      max={100}
      inputMode="numeric"
      // Remounted when the URL value changes, so the box follows a saved view or "Clear filters".
      key={current}
      aria-label={label}
      placeholder={paramKey === "scoreMin" ? "Min" : "Max"}
      defaultValue={current}
      onBlur={(e) => {
        // Leaving the box without changing it must not navigate (and reset the list's scroll).
        if (e.target.value !== current) setParam({ [paramKey]: e.target.value || null });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-20"
    />
  );
}

function ScoreRange() {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 text-sm">
      <legend className="text-xs font-medium text-muted">Score</legend>
      <div className="flex items-center gap-2">
        <ScoreInput paramKey="scoreMin" label="Minimum score" />
        <span aria-hidden className="text-muted">
          –
        </span>
        <span className="sr-only">to</span>
        <ScoreInput paramKey="scoreMax" label="Maximum score" />
      </div>
    </fieldset>
  );
}

function FlagToggles() {
  const searchParams = useSearchParams();
  const setParam = useUrlParams();
  const active = new Set((searchParams.get("flags") ?? "").split(",").filter(Boolean));

  function toggle(flag: LeadFlagKey) {
    const next = new Set(active);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    setParam({ flags: next.size > 0 ? [...next].join(",") : null });
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-1 text-sm">
      <legend className="text-xs font-medium text-muted">Flags</legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(LEAD_FLAGS) as LeadFlagKey[]).map((flag) => {
          const on = active.has(flag);
          return (
            <button
              key={flag}
              type="button"
              aria-pressed={on}
              onClick={() => {
                toggle(flag);
              }}
              className={cn(
                "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on
                  ? "border-primary bg-primary-soft text-primary-soft-foreground"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {/* A flag that is on is marked by the tick as well as the colour. */}
              {on && <Check aria-hidden className="size-4" />}
              {LEAD_FLAGS[flag]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function DateFilter() {
  const searchParams = useSearchParams();
  const setParam = useUrlParams();
  const field =
    DATE_FIELD_OPTIONS.find((option) => option.value === searchParams.get("dateField"))?.value ??
    "created";

  return (
    // Wraps: three controls side by side don't fit a phone, and must never push the page sideways.
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Date</span>
        <Select
          aria-label="Date to filter by"
          value={field}
          options={DATE_FIELD_OPTIONS}
          onChange={(e) => {
            setParam({ dateField: e.target.value === "created" ? null : e.target.value });
          }}
        />
      </label>
      <UrlDateInput paramKey="from" label="From" />
      <UrlDateInput paramKey="to" label="To" />
    </div>
  );
}

export function LeadsFilterBar({
  owners,
  sources,
  signalTypes,
  basePath,
}: {
  owners: SelectOption[];
  sources: string[];
  signalTypes: string[];
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasFilters = LEAD_FILTER_KEYS.some((key) => searchParams.has(key));

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <SearchInput />
        <UrlSelect paramKey="group" label="Status" options={STATUS_GROUP_OPTIONS} />
        <UrlSelect paramKey="market" label="Market" options={MARKET_OPTIONS} />
        <UrlSelect paramKey="owner" label="Owner" options={owners} allLabel="Any owner" />
        <UrlSelect
          paramKey="source"
          label="Source"
          options={sources.map((s) => ({ value: s, label: s }))}
          allLabel="Any source"
        />
        <UrlSelect
          paramKey="signal"
          label="Signal"
          options={signalTypes.map((s) => ({ value: s, label: s }))}
          allLabel="Any signal"
        />
      </FilterBar>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <ScoreRange />
        <DateFilter />
        <FlagToggles />
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              router.replace(basePath, { scroll: false });
            }}
          >
            <X aria-hidden className="size-4" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
