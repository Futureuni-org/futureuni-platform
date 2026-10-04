"use client";

import type { Market } from "@/contracts/common";

import { Combobox } from "./combobox";
import { INTERNATIONAL_LOCATIONS, NIGERIA_LOCATIONS } from "./locations";
import { LimitSlider } from "./limit-slider";
import { SegmentedControl } from "./segmented-control";
import { SourceSelect } from "./source-select";
import { TagInput } from "./tag-input";
import { marketsOf, type MarketMode, type SearchDraft, type SourceOption } from "./types";

/**
 * The shared search-spec fields (market, location(s), keywords, sources, limit) used by both the
 * Search panel and the saved-search editor, so the two always match.
 */

const MARKET_OPTIONS: { value: MarketMode; label: string }[] = [
  { value: "NIGERIA", label: "Nigeria" },
  { value: "INTERNATIONAL", label: "International" },
  { value: "BOTH", label: "Both" },
];

export function SpecFields({
  draft,
  onChange,
  sourceOptions,
}: {
  draft: SearchDraft;
  onChange: (patch: Partial<SearchDraft>) => void;
  sourceOptions: SourceOption[];
}): React.ReactElement {
  const markets: Market[] = marketsOf(draft.market);
  return (
    <div className="flex flex-col gap-6">
      <Field label="Market">
        <SegmentedControl
          ariaLabel="Market"
          options={MARKET_OPTIONS}
          value={draft.market}
          onChange={(market) => {
            onChange({ market });
          }}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        {markets.includes("NIGERIA") ? (
          <Field label="Location (Nigeria)">
            <Combobox
              label="Nigerian location"
              value={draft.ngLocation}
              onChange={(ngLocation) => {
                onChange({ ngLocation });
              }}
              suggestions={NIGERIA_LOCATIONS}
              placeholder="e.g. Lagos"
            />
          </Field>
        ) : null}
        {markets.includes("INTERNATIONAL") ? (
          <Field label="Location (International)">
            <Combobox
              label="International location"
              value={draft.intlLocation}
              onChange={(intlLocation) => {
                onChange({ intlLocation });
              }}
              suggestions={INTERNATIONAL_LOCATIONS}
              placeholder="e.g. London, UK"
            />
          </Field>
        ) : null}
      </div>

      <Field label="Keywords" hint="Pre-filled from this line's profile. Edit to focus the search.">
        <TagInput
          label="Keywords"
          tags={draft.keywords}
          onChange={(keywords) => {
            onChange({ keywords });
          }}
          placeholder="Add a keyword and press Enter"
        />
      </Field>

      <Field label="Sources">
        <SourceSelect
          options={sourceOptions}
          selectedMarkets={markets}
          value={draft.sources}
          onChange={(sources) => {
            onChange({ sources });
          }}
        />
      </Field>

      <LimitSlider
        value={draft.limit}
        onChange={(limit) => {
          onChange({ limit });
        }}
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint !== undefined ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
      {error !== undefined ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function validateDraft(draft: SearchDraft): string | null {
  const markets = marketsOf(draft.market);
  if (markets.includes("NIGERIA") && draft.ngLocation.trim().length < 2) {
    return "Add a Nigerian location.";
  }
  if (markets.includes("INTERNATIONAL") && draft.intlLocation.trim().length < 2) {
    return "Add an international location.";
  }
  return null;
}
