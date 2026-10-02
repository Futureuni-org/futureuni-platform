"use client";

import { SettingsSection } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";
import { useDraft } from "../profile-draft-context";
import { AUDIT_AGENT_IDS, AUDIT_CHECK_IDS, type AuditConfig } from "../profile-types";
import { AddButton, CheckboxField, ItemCard, SelectField } from "../editor-fields";

export function AuditsSection() {
  const { draft, canEdit, setField } = useDraft();

  function set(next: AuditConfig[]) {
    setField("audits", next);
  }
  function patch(index: number, change: Partial<AuditConfig>) {
    set(draft.audits.map((a, i) => (i === index ? { ...a, ...change } : a)));
  }
  function addAgent() {
    const used = new Set(draft.audits.map((a) => a.agentId));
    const free = AUDIT_AGENT_IDS.find((a) => !used.has(a)) ?? AUDIT_AGENT_IDS[0];
    const firstCheck = AUDIT_CHECK_IDS[0];
    if (free === undefined || firstCheck === undefined) return;
    set([...draft.audits, { agentId: free, checks: [{ checkId: firstCheck, required: true }] }]);
  }

  return (
    <SettingsSection
      eyebrow="Audits"
      title="Audits to run"
      description="The audit agents and their checks. Required checks must pass before a lead is scored."
      emphasized
      actions={canEdit ? <AddButton label="Add audit agent" onClick={addAgent} /> : undefined}
    >
      {draft.audits.length === 0 ? (
        <EmptyState title="No audits yet" description="Add at least one audit agent." />
      ) : (
        <div className="flex flex-col gap-4">
          {draft.audits.map((audit, i) => (
            <ItemCard
              key={i}
              title={audit.agentId}
              canEdit={canEdit}
              onRemove={() => {
                set(draft.audits.filter((_, idx) => idx !== i));
              }}
            >
              <SelectField
                label="Agent"
                value={audit.agentId}
                disabled={!canEdit}
                options={AUDIT_AGENT_IDS.map((a) => ({ value: a, label: a }))}
                onChange={(v) => {
                  patch(i, { agentId: v as AuditConfig["agentId"] });
                }}
              />
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-foreground">Checks</p>
                {audit.checks.map((chk, ci) => (
                  <div key={ci} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[14rem] flex-1">
                      <SelectField
                        label="Check"
                        value={chk.checkId}
                        disabled={!canEdit}
                        options={AUDIT_CHECK_IDS.map((c) => ({ value: c, label: c }))}
                        onChange={(v) => {
                          patch(i, {
                            checks: audit.checks.map((c, idx) =>
                              idx === ci ? { ...c, checkId: v as typeof c.checkId } : c,
                            ),
                          });
                        }}
                      />
                    </div>
                    <CheckboxField
                      label="Required"
                      checked={chk.required}
                      disabled={!canEdit}
                      onChange={(required) => {
                        patch(i, {
                          checks: audit.checks.map((c, idx) => (idx === ci ? { ...c, required } : c)),
                        });
                      }}
                    />
                    {canEdit && audit.checks.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => {
                          patch(i, { checks: audit.checks.filter((_, idx) => idx !== ci) });
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <AddButton
                    label="Add check"
                    onClick={() => {
                      const first = AUDIT_CHECK_IDS[0];
                      if (first === undefined) return;
                      patch(i, { checks: [...audit.checks, { checkId: first, required: false }] });
                    }}
                  />
                )}
              </div>
            </ItemCard>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
