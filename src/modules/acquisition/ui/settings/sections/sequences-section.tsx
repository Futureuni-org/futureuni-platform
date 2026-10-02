"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { SettingsSection } from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useDraft } from "../profile-draft-context";
import {
  CHANNELS,
  MARKETS,
  STEP_PURPOSES,
  STOP_CONDITIONS,
  isAutomaticChannel,
  type Market,
  type SequenceDef,
  type SequenceStep,
} from "../profile-types";
import {
  AddButton,
  CheckboxField,
  ChipMultiSelect,
  NumberField,
  SelectField,
  TextField,
} from "../editor-fields";

export function SequencesSection() {
  const { draft, canEdit, setField } = useDraft();

  function setMarket(market: Market, next: SequenceDef[]) {
    setField("sequences", { ...draft.sequences, [market]: next });
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-muted">
        Each market needs exactly one default sequence. Only email steps send automatically; WhatsApp,
        LinkedIn and call steps are always prepared for a person to send (INV-7).
      </p>
      {MARKETS.map((m) => {
        const market = m.value;
        const sequences = draft.sequences[market];
        const angleIds = draft.pitchAngles[market].map((a) => a.id);
        return (
          <SettingsSection
            key={market}
            eyebrow="Sequences"
            title={m.label}
            emphasized
            actions={
              canEdit ? (
                <AddButton
                  label="Add sequence"
                  onClick={() => {
                    let n = sequences.length + 1;
                    const existing = new Set(sequences.map((s) => s.id));
                    while (existing.has(`seq_${String(n)}`)) n += 1;
                    setMarket(market, [
                      ...sequences,
                      {
                        id: `seq_${String(n)}`,
                        name: "New sequence",
                        isDefault: sequences.length === 0,
                        steps: [
                          {
                            index: 0,
                            channel: "EMAIL",
                            delayBusinessDays: 0,
                            purpose: "INTRO_AUDIT_INSIGHT",
                            includeBookingLink: false,
                            stopConditions: [...STOP_CONDITIONS],
                          },
                        ],
                      },
                    ]);
                  }}
                />
              ) : undefined
            }
          >
            {sequences.map((seq, si) => {
              function patchSeq(change: Partial<SequenceDef>) {
                setMarket(
                  market,
                  sequences.map((s, idx) => (idx === si ? { ...s, ...change } : s)),
                );
              }
              function makeDefault() {
                setMarket(
                  market,
                  sequences.map((s, idx) => ({ ...s, isDefault: idx === si })),
                );
              }
              return (
                <div key={si} className="flex flex-col gap-4 rounded-lg bg-zone px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{seq.name || seq.id}</span>
                      {seq.isDefault && <Badge tone="primary">Default</Badge>}
                    </div>
                    {canEdit && sequences.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => {
                          setMarket(
                            market,
                            sequences.filter((_, idx) => idx !== si),
                          );
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="max-w-sm">
                    <TextField
                      label="Name"
                      value={seq.name}
                      disabled={!canEdit}
                      onChange={(v) => {
                        patchSeq({ name: v });
                      }}
                    />
                  </div>
                  {!seq.isDefault && canEdit && (
                    <Button variant="secondary" size="sm" className="self-start" onClick={makeDefault}>
                      Make default
                    </Button>
                  )}

                  <StepTimeline
                    steps={seq.steps}
                    angleIds={angleIds}
                    canEdit={canEdit}
                    onChange={(steps) => {
                      patchSeq({ steps });
                    }}
                  />
                </div>
              );
            })}
          </SettingsSection>
        );
      })}
    </div>
  );
}

function reindex(steps: SequenceStep[]): SequenceStep[] {
  return steps.map((s, i) => ({ ...s, index: i }));
}

function StepTimeline({
  steps,
  angleIds,
  canEdit,
  onChange,
}: {
  steps: SequenceStep[];
  angleIds: string[];
  canEdit: boolean;
  onChange: (steps: SequenceStep[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = steps.map((_, i) => `step-${String(i)}`);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(reindex(arrayMove(steps, from, to)));
  }

  function patchStep(i: number, change: Partial<SequenceStep>) {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...change } : s)));
  }

  return (
    <div className="flex flex-col gap-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => {
              const day = steps.slice(0, i + 1).reduce((acc, s) => acc + s.delayBusinessDays, 0);
              return (
                <SortableStep
                  key={ids[i]}
                  id={ids[i] ?? String(i)}
                  step={step}
                  day={day}
                  angleIds={angleIds}
                  canEdit={canEdit}
                  canRemove={steps.length > 1}
                  onChange={(change) => {
                    patchStep(i, change);
                  }}
                  onRemove={() => {
                    onChange(reindex(steps.filter((_, idx) => idx !== i)));
                  }}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
      {canEdit && steps.length < 8 && (
        <AddButton
          label="Add step"
          onClick={() => {
            onChange(
              reindex([
                ...steps,
                {
                  index: steps.length,
                  channel: "EMAIL",
                  delayBusinessDays: 3,
                  purpose: "FOLLOW_UP",
                  includeBookingLink: false,
                  stopConditions: [...STOP_CONDITIONS],
                },
              ]),
            );
          }}
        />
      )}
      <PreviewTimeline steps={steps} />
    </div>
  );
}

function SortableStep({
  id,
  step,
  day,
  angleIds,
  canEdit,
  canRemove,
  onChange,
  onRemove,
}: {
  id: string;
  step: SequenceStep;
  day: number;
  angleIds: string[];
  canEdit: boolean;
  canRemove: boolean;
  onChange: (change: Partial<SequenceStep>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-3 rounded-md bg-surface p-3",
        isDragging && "opacity-60 shadow-lift",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              aria-label="Drag to reorder"
              className="cursor-grab touch-none text-muted"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          )}
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            Day {day}
          </span>
          {!isAutomaticChannel(step.channel) && <Badge tone="info">assisted</Badge>}
        </div>
        {canEdit && canRemove && (
          <Button variant="ghost" size="sm" className="text-danger" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Channel"
          value={step.channel}
          disabled={!canEdit}
          options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
          onChange={(v) => {
            onChange({ channel: v as SequenceStep["channel"] });
          }}
        />
        <NumberField
          label="Delay (business days)"
          value={step.delayBusinessDays}
          min={0}
          max={30}
          disabled={!canEdit}
          onChange={(v) => {
            onChange({ delayBusinessDays: v ?? 0 });
          }}
        />
        <SelectField
          label="Purpose"
          value={step.purpose}
          disabled={!canEdit}
          options={STEP_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
          onChange={(v) => {
            onChange({ purpose: v as SequenceStep["purpose"] });
          }}
        />
        <SelectField
          label="Pitch angle"
          value={step.pitchAngleId ?? ""}
          disabled={!canEdit}
          options={[
            { value: "", label: "None" },
            ...angleIds.map((a) => ({ value: a, label: a })),
          ]}
          onChange={(v) => {
            onChange({ pitchAngleId: v === "" ? undefined : v });
          }}
        />
      </div>
      <CheckboxField
        label="Include booking link"
        checked={step.includeBookingLink}
        disabled={!canEdit}
        onChange={(checked) => {
          onChange({ includeBookingLink: checked });
        }}
      />
      <ChipMultiSelect
        label="Stop conditions"
        values={step.stopConditions}
        options={STOP_CONDITIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase() }))}
        disabled={!canEdit}
        onChange={(v) => {
          onChange({ stopConditions: v as SequenceStep["stopConditions"] });
        }}
      />
    </li>
  );
}

function PreviewTimeline({ steps }: { steps: SequenceStep[] }) {
  return (
    <div className="rounded-md bg-surface p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
        What the lead experiences
      </p>
      <ol className="flex flex-col gap-1 text-sm">
        {steps.map((step, i) => {
          const day = steps.slice(0, i + 1).reduce((acc, s) => acc + s.delayBusinessDays, 0);
          const channel = CHANNELS.find((c) => c.value === step.channel)?.label ?? step.channel;
          const purpose = STEP_PURPOSES.find((p) => p.value === step.purpose)?.label ?? step.purpose;
          return (
            <li key={i} className="flex gap-2">
              <span className="w-20 shrink-0 font-mono text-xs text-muted">Day {day}</span>
              <span className="text-foreground">
                {channel} — {purpose}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
