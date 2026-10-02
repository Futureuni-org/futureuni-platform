"use client";

import { SettingsSection } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import { useDraft } from "../profile-draft-context";
import { MARKETS, SOURCE_ADAPTER_IDS, type Source } from "../profile-types";
import {
  AddButton,
  CheckboxField,
  ChipMultiSelect,
  ItemCard,
  JsonObjectField,
  SelectField,
} from "../editor-fields";

export function SourcesSection() {
  const { draft, canEdit, setField } = useDraft();

  function set(next: Source[]) {
    setField("sources", next);
  }
  function patch(index: number, change: Partial<Source>) {
    set(draft.sources.map((s, i) => (i === index ? { ...s, ...change } : s)));
  }
  function add() {
    const used = new Set(draft.sources.map((s) => s.adapterId));
    const free = SOURCE_ADAPTER_IDS.find((a) => !used.has(a)) ?? SOURCE_ADAPTER_IDS[0];
    if (free === undefined) return;
    set([
      ...draft.sources,
      {
        adapterId: free,
        markets: ["NIGERIA", "INTERNATIONAL"],
        enabled: true,
        optional: false,
        defaultParams: {},
      },
    ]);
  }

  return (
    <SettingsSection
      eyebrow="Sources"
      title="Where leads come from"
      description="The adapters that find companies in each market, and their default search parameters."
      emphasized
      actions={canEdit ? <AddButton label="Add source" onClick={add} /> : undefined}
    >
      {draft.sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Add at least one source adapter." />
      ) : (
        <div className="flex flex-col gap-4">
          {draft.sources.map((src, i) => (
            <ItemCard
              key={i}
              title={src.adapterId}
              canEdit={canEdit}
              onRemove={() => {
                set(draft.sources.filter((_, idx) => idx !== i));
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Adapter"
                  value={src.adapterId}
                  disabled={!canEdit}
                  options={SOURCE_ADAPTER_IDS.map((a) => ({ value: a, label: a }))}
                  onChange={(v) => {
                    patch(i, { adapterId: v as Source["adapterId"] });
                  }}
                />
                <ChipMultiSelect
                  label="Markets"
                  values={src.markets}
                  options={MARKETS}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { markets: v as Source["markets"] });
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-6">
                <CheckboxField
                  label="Enabled"
                  checked={src.enabled}
                  disabled={!canEdit}
                  onChange={(checked) => {
                    patch(i, { enabled: checked });
                  }}
                />
                <CheckboxField
                  label="Optional (tolerate if the adapter isn't registered)"
                  checked={src.optional}
                  disabled={!canEdit}
                  onChange={(checked) => {
                    patch(i, { optional: checked });
                  }}
                />
              </div>
              {MARKETS.map((m) => (
                <JsonObjectField
                  key={m.value}
                  label={`${m.label} default parameters`}
                  description="Keywords, place types, regions, job titles — validated against the adapter's schema on publish."
                  disabled={!canEdit}
                  value={src.defaultParams[m.value] ?? {}}
                  onChange={(params) => {
                    patch(i, {
                      defaultParams: { ...src.defaultParams, [m.value]: params },
                    });
                  }}
                />
              ))}
            </ItemCard>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
