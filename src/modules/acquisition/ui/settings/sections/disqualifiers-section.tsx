"use client";

import { SettingsSection } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import { useDraft } from "../profile-draft-context";
import type { Disqualifier } from "../profile-types";
import { AddButton, CheckboxField, ItemCard, TextAreaField, TextField } from "../editor-fields";
import { ConditionBuilder } from "../condition-builder";

export function DisqualifiersSection() {
  const { draft, canEdit, setField } = useDraft();
  const signalIds = draft.signals.map((s) => s.id);

  function set(next: Disqualifier[]) {
    setField("disqualifiers", next);
  }
  function patch(index: number, change: Partial<Disqualifier>) {
    set(draft.disqualifiers.map((d, i) => (i === index ? { ...d, ...change } : d)));
  }
  function add() {
    let n = draft.disqualifiers.length + 1;
    const existing = new Set(draft.disqualifiers.map((d) => d.id));
    while (existing.has(`disqualifier_${String(n)}`)) n += 1;
    set([
      ...draft.disqualifiers,
      { id: `disqualifier_${String(n)}`, label: "New disqualifier", description: "" },
    ]);
  }

  return (
    <SettingsSection
      eyebrow="Disqualifiers"
      title="When to drop a lead"
      description="Automatic rules (a condition) or reasons judged by a human or the AI review."
      emphasized
      actions={canEdit ? <AddButton label="Add disqualifier" onClick={add} /> : undefined}
    >
      {draft.disqualifiers.length === 0 ? (
        <EmptyState title="No disqualifiers" description="Add one to drop leads that don't fit." />
      ) : (
        <div className="flex flex-col gap-4">
          {draft.disqualifiers.map((dq, i) => {
            const automatic = dq.condition !== undefined;
            return (
              <ItemCard
                key={i}
                title={dq.label || dq.id}
                badge={<span className="font-mono text-xs text-muted">{dq.id}</span>}
                canEdit={canEdit}
                onRemove={() => {
                  set(draft.disqualifiers.filter((_, idx) => idx !== i));
                }}
              >
                <TextField
                  label="Label"
                  value={dq.label}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { label: v });
                  }}
                />
                <TextAreaField
                  label="Description"
                  value={dq.description}
                  rows={2}
                  disabled={!canEdit}
                  onChange={(v) => {
                    patch(i, { description: v });
                  }}
                />
                <CheckboxField
                  label="Automatic (match a condition)"
                  description="Off = judged by a human or the AI borderline review."
                  checked={automatic}
                  disabled={!canEdit}
                  onChange={(checked) => {
                    patch(
                      i,
                      checked
                        ? {
                            condition: {
                              all: [
                                { kind: "field", field: "company.isActiveClient", op: "eq", value: true },
                              ],
                            },
                          }
                        : { condition: undefined },
                    );
                  }}
                />
                {automatic && dq.condition !== undefined ? (
                  <ConditionBuilder
                    condition={dq.condition}
                    signalIds={signalIds}
                    disabled={!canEdit}
                    onChange={(condition) => {
                      patch(i, { condition });
                    }}
                  />
                ) : (
                  <TextAreaField
                    label="AI review hint"
                    description="Guidance passed to the borderline-review AI task."
                    value={dq.aiReviewHint ?? ""}
                    rows={2}
                    disabled={!canEdit}
                    onChange={(v) => {
                      patch(i, { aiReviewHint: v === "" ? undefined : v });
                    }}
                  />
                )}
              </ItemCard>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}
