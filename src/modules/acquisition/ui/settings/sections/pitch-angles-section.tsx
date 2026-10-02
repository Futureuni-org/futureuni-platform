"use client";

import { SettingsSection } from "@/components/admin";
import { useDraft } from "../profile-draft-context";
import { AUDIT_CHECK_IDS, MARKETS, type Market, type PitchAngle } from "../profile-types";
import {
  AddButton,
  ChipMultiSelect,
  ItemCard,
  StringListField,
  TextAreaField,
} from "../editor-fields";

export function PitchAnglesSection() {
  const { draft, canEdit, setField } = useDraft();
  const signalIds = draft.signals.map((s) => s.id);

  function setMarket(market: Market, next: PitchAngle[]) {
    setField("pitchAngles", { ...draft.pitchAngles, [market]: next });
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-muted">
        Each market needs 3–5 angles. A warning appears where an angle&apos;s proof tags match no
        non-placeholder portfolio item.
      </p>
      {MARKETS.map((m) => {
        const market = m.value;
        const angles = draft.pitchAngles[market];
        return (
          <SettingsSection
            key={market}
            eyebrow="Pitch angles"
            title={m.label}
            emphasized
            actions={
              canEdit && angles.length < 5 ? (
                <AddButton
                  label="Add angle"
                  onClick={() => {
                    let n = angles.length + 1;
                    const existing = new Set(angles.map((a) => a.id));
                    while (existing.has(`angle_${String(n)}`)) n += 1;
                    setMarket(market, [
                      ...angles,
                      {
                        id: `angle_${String(n)}`,
                        hook: "",
                        whenToUse: { signals: [], findingChecks: [] },
                        proofTags: [],
                        avoidPhrases: [],
                      },
                    ]);
                  }}
                />
              ) : undefined
            }
          >
            {angles.length < 3 && (
              <p className="text-sm text-warning">At least 3 angles are required for {m.label}.</p>
            )}
            <div className="flex flex-col gap-4">
              {angles.map((angle, i) => {
                function patch(change: Partial<PitchAngle>) {
                  setMarket(
                    market,
                    angles.map((a, idx) => (idx === i ? { ...a, ...change } : a)),
                  );
                }
                return (
                  <ItemCard
                    key={i}
                    title={angle.id}
                    canEdit={canEdit}
                    onRemove={
                      angles.length > 3
                        ? () => {
                            setMarket(
                              market,
                              angles.filter((_, idx) => idx !== i),
                            );
                          }
                        : undefined
                    }
                  >
                    <TextAreaField
                      label="Hook"
                      description="One line, 10–200 characters."
                      value={angle.hook}
                      rows={2}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({ hook: v });
                      }}
                    />
                    <ChipMultiSelect
                      label="Use when these signals are present"
                      values={angle.whenToUse.signals}
                      options={signalIds.map((s) => ({ value: s, label: s }))}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({ whenToUse: { ...angle.whenToUse, signals: v } });
                      }}
                    />
                    <ChipMultiSelect
                      label="Use when these checks have findings"
                      values={angle.whenToUse.findingChecks}
                      options={AUDIT_CHECK_IDS.map((c) => ({ value: c, label: c }))}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({
                          whenToUse: {
                            ...angle.whenToUse,
                            findingChecks: v as typeof angle.whenToUse.findingChecks,
                          },
                        });
                      }}
                    />
                    <StringListField
                      label="Proof tags"
                      description="Match a non-placeholder portfolio item's tags."
                      values={angle.proofTags}
                      lowercaseSlug
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({ proofTags: v });
                      }}
                    />
                    <StringListField
                      label="Phrases to avoid"
                      values={angle.avoidPhrases}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patch({ avoidPhrases: v });
                      }}
                    />
                  </ItemCard>
                );
              })}
            </div>
          </SettingsSection>
        );
      })}
    </div>
  );
}
