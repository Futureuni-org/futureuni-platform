"use client";

import { SettingsSection } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import { useDraft } from "../profile-draft-context";
import {
  AUDIT_CHECK_IDS,
  MARKETS,
  SOURCE_ADAPTER_IDS,
  type Signal,
} from "../profile-types";
import {
  AddButton,
  CheckboxField,
  ChipMultiSelect,
  ItemCard,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "../editor-fields";

export function SignalsSection({ publishedSignalIds }: { publishedSignalIds: string[] }) {
  const { draft, canEdit, setField } = useDraft();
  const published = new Set(publishedSignalIds);

  function set(next: Signal[]) {
    setField("signals", next);
  }
  function patch(index: number, change: Partial<Signal>) {
    set(draft.signals.map((s, i) => (i === index ? { ...s, ...change } : s)));
  }
  function add() {
    let n = draft.signals.length + 1;
    const existing = new Set(draft.signals.map((s) => s.id));
    while (existing.has(`signal_${String(n)}`)) n += 1;
    set([
      ...draft.signals,
      {
        id: `signal_${String(n)}`,
        label: "New signal",
        description: "",
        weight: 10,
        markets: ["NIGERIA", "INTERNATIONAL"],
        evidenceRequired: "",
        detectingSources: [],
        confirmedBy: [],
        future: false,
      },
    ]);
  }

  return (
    <SettingsSection
      eyebrow="Signals"
      title="Signals"
      description="What tells us a company needs this service, and where we find it."
      emphasized
      actions={canEdit ? <AddButton label="Add signal" onClick={add} /> : undefined}
    >
      {draft.signals.length === 0 ? (
        <EmptyState title="No signals yet" description="Add at least one signal." />
      ) : (
        <div className="flex flex-col gap-4">
          {draft.signals.map((sig, i) => {
            const locked = published.has(sig.id);
            return (
              <ItemCard
                key={i}
                title={sig.label || sig.id}
                badge={
                  <span className="font-mono text-xs text-muted">{sig.id}</span>
                }
                canEdit={canEdit}
                onRemove={() => {
                  set(draft.signals.filter((_, idx) => idx !== i));
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="ID"
                    mono
                    value={sig.id}
                    disabled={!canEdit || locked}
                    description={locked ? "Permanent once published." : "Lower-case slug; permanent once published."}
                    onChange={(v) => {
                      patch(i, { id: v });
                    }}
                  />
                  <TextField
                    label="Label"
                    value={sig.label}
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch(i, { label: v });
                    }}
                  />
                </div>
                <TextAreaField
                  label="Description"
                  value={sig.description}
                  rows={2}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { description: v });
                  }}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Weight"
                    value={sig.weight}
                    min={0}
                    max={100}
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch(i, { weight: v ?? 0 });
                    }}
                  />
                  <SelectField
                    label="Derived from"
                    value={sig.derivedFrom ?? ""}
                    disabled={!canEdit}
                    options={[
                      { value: "", label: "An adapter detects it" },
                      { value: "enrichment", label: "Enrichment" },
                      { value: "audit", label: "Audit" },
                    ]}
                    onChange={(v) => {
                      patch(i, { derivedFrom: v === "" ? undefined : (v as Signal["derivedFrom"]) });
                    }}
                  />
                </div>
                <ChipMultiSelect
                  label="Markets"
                  values={sig.markets}
                  options={MARKETS}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { markets: v as Signal["markets"] });
                  }}
                />
                <TextField
                  label="Evidence needed"
                  value={sig.evidenceRequired}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { evidenceRequired: v });
                  }}
                />
                <ChipMultiSelect
                  label="Detecting sources"
                  values={sig.detectingSources}
                  options={SOURCE_ADAPTER_IDS.map((a) => ({ value: a, label: a }))}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { detectingSources: v as Signal["detectingSources"] });
                  }}
                />
                <ChipMultiSelect
                  label="Confirmed by audits"
                  values={sig.confirmedBy}
                  options={AUDIT_CHECK_IDS.map((c) => ({ value: c, label: c }))}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { confirmedBy: v as Signal["confirmedBy"] });
                  }}
                />
                <CheckboxField
                  label="Future signal (declared, no detector yet)"
                  checked={sig.future}
                  disabled={!canEdit}
                  onChange={(checked) => {
                    patch(i, { future: checked });
                  }}
                />
              </ItemCard>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}
