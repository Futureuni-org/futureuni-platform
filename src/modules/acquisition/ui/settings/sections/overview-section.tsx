"use client";

import { SettingsSection } from "@/components/admin";
import { useDraft } from "../profile-draft-context";
import { APPROVAL_MODES, LOW_SCORE_ACTIONS } from "../profile-types";
import {
  CheckboxField,
  ChipMultiSelect,
  NumberField,
  SelectField,
  StringListField,
  TextAreaField,
  TextField,
} from "../editor-fields";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "SERVICE_LEAD", label: "Service lead" },
  { value: "MEMBER", label: "Member" },
];

export function OverviewSection({
  teamUsers,
}: {
  teamUsers: { id: string; name: string | null; email: string }[];
}) {
  const { draft, canEdit, setField, update } = useDraft();
  const disabled = !canEdit;

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection eyebrow="Overview" title="Line basics" emphasized>
        <TextField
          label="Label"
          value={draft.label}
          disabled={disabled}
          onChange={(v) => {
            setField("label", v);
          }}
        />
        <TextAreaField
          label="Description"
          description="One line shown in the line header."
          value={draft.description}
          disabled={disabled}
          rows={2}
          onChange={(v) => {
            setField("description", v);
          }}
        />
        <StringListField
          label="Contact role priority"
          description="The decision-maker roles to prefer, most important first."
          values={draft.contactRolePriority}
          disabled={disabled}
          onChange={(v) => {
            setField("contactRolePriority", v);
          }}
        />
      </SettingsSection>

      <SettingsSection eyebrow="Owners" title="Who owns this line">
        <ChipMultiSelect
          label="Owner roles"
          values={draft.owners.roles}
          disabled={disabled}
          options={ROLE_OPTIONS}
          onChange={(roles) => {
            update((d) => ({ ...d, owners: { ...d.owners, roles: roles as typeof d.owners.roles } }));
          }}
        />
        <ChipMultiSelect
          label="Named owners"
          values={draft.owners.userIds}
          disabled={disabled}
          options={teamUsers.map((u) => ({ value: u.id, label: u.name ?? u.email }))}
          onChange={(userIds) => {
            update((d) => ({ ...d, owners: { ...d.owners, userIds } }));
          }}
        />
      </SettingsSection>

      <SettingsSection eyebrow="Approval" title="How outreach is approved">
        <SelectField
          label="Approval mode"
          value={draft.approvalMode}
          disabled={disabled}
          options={[...APPROVAL_MODES]}
          onChange={(v) => {
            update((d) => ({
              ...d,
              approvalMode: v as typeof d.approvalMode,
              ...(v === "AUTO_SEND_ABOVE_SCORE" && d.autoSendMinScore === undefined
                ? { autoSendMinScore: 80 }
                : {}),
            }));
          }}
        />
        {draft.approvalMode === "AUTO_SEND_ABOVE_SCORE" && (
          <NumberField
            label="Auto-send minimum score"
            description="Drafts at or above this score, that pass every automatic check, are sent without review."
            value={draft.autoSendMinScore ?? null}
            min={0}
            max={100}
            disabled={disabled}
            onChange={(v) => {
              update((d) => ({ ...d, ...(v === null ? {} : { autoSendMinScore: v }) }));
            }}
          />
        )}
      </SettingsSection>

      <SettingsSection
        eyebrow="Capacity"
        title="Capacity policy"
        description="Overrides the platform throttle for this line."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <NumberField
            label="Slow at (%)"
            value={draft.capacityPolicy.slowAtPercent}
            min={1}
            max={100}
            suffix="%"
            disabled={disabled}
            onChange={(v) => {
              update((d) => ({ ...d, capacityPolicy: { ...d.capacityPolicy, slowAtPercent: v ?? 0 } }));
            }}
          />
          <NumberField
            label="Pause at (%)"
            value={draft.capacityPolicy.pauseAtPercent}
            min={1}
            max={200}
            suffix="%"
            disabled={disabled}
            onChange={(v) => {
              update((d) => ({ ...d, capacityPolicy: { ...d.capacityPolicy, pauseAtPercent: v ?? 0 } }));
            }}
          />
          <NumberField
            label="Slow factor"
            description="SLOW cap = normal cap × this (0–1)."
            value={draft.capacityPolicy.slowFactor}
            min={0}
            max={1}
            disabled={disabled}
            onChange={(v) => {
              update((d) => ({ ...d, capacityPolicy: { ...d.capacityPolicy, slowFactor: v ?? 0 } }));
            }}
          />
          <NumberField
            label="Daily first-touch cap"
            description="Optional override of the per-line daily cap."
            value={draft.capacityPolicy.dailyFirstTouchCap ?? null}
            min={0}
            max={500}
            disabled={disabled}
            onChange={(v) => {
              update((d) => {
                const cp = { ...d.capacityPolicy };
                if (v === null) {
                  delete cp.dailyFirstTouchCap;
                } else {
                  cp.dailyFirstTouchCap = v;
                }
                return { ...d, capacityPolicy: cp };
              });
            }}
          />
        </div>
        <SelectField
          label="New qualified leads while paused"
          value={draft.capacityPolicy.newQualifiedLeadsWhenPaused}
          disabled={disabled}
          options={[
            { value: "NURTURE", label: "Hold in nurture" },
            { value: "CONTINUE", label: "Continue" },
          ]}
          onChange={(v) => {
            update((d) => ({
              ...d,
              capacityPolicy: {
                ...d.capacityPolicy,
                newQualifiedLeadsWhenPaused: v as typeof d.capacityPolicy.newQualifiedLeadsWhenPaused,
              },
            }));
          }}
        />
        <CheckboxField
          label="Pause scheduled searches while paused"
          checked={draft.capacityPolicy.pauseScheduledSearches}
          disabled={disabled}
          onChange={(checked) => {
            update((d) => ({
              ...d,
              capacityPolicy: { ...d.capacityPolicy, pauseScheduledSearches: checked },
            }));
          }}
        />
        <p className="text-xs text-muted">
          Low-score action for this line:{" "}
          {LOW_SCORE_ACTIONS.find((a) => a.value === draft.scoring.lowScoreAction)?.label} (set under
          Scoring).
        </p>
      </SettingsSection>
    </div>
  );
}
