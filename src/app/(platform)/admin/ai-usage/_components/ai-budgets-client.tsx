"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SettingsSection } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { NumberField, TextField } from "@/modules/acquisition/ui/settings/editor-fields";
import { updateAiBudgetsAction, updateModelTiersAction } from "../actions";

export interface Budgets {
  platformDailyUsd: number;
  platformMonthlyUsd: number;
  perModuleDailyUsd: Record<string, number>;
  perUserDailyCalls: number;
  perTaskMaxTokens: number;
}
export interface ModelTiers {
  fast: string;
  balanced: string;
  deep: string;
  fastFallback: string | null;
  balancedFallback: string | null;
  deepFallback: string | null;
}

export function BudgetForm({ initial, canEdit }: { initial: Budgets; canEdit: boolean }) {
  const router = useRouter();
  const [daily, setDaily] = useState(initial.platformDailyUsd);
  const [monthly, setMonthly] = useState(initial.platformMonthlyUsd);
  const [calls, setCalls] = useState(initial.perUserDailyCalls);
  const [tokens, setTokens] = useState(initial.perTaskMaxTokens);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateAiBudgetsAction({
        ...initial,
        platformDailyUsd: daily,
        platformMonthlyUsd: monthly,
        perUserDailyCalls: calls,
        perTaskMaxTokens: tokens,
      });
      if (result.ok) { toast.success("Budgets saved."); router.refresh(); }
      else toast.error(result.error.message);
    });
  }

  return (
    <SettingsSection eyebrow="Budgets" title="Spend limits">
      <div className="grid gap-6 sm:grid-cols-2">
        <NumberField label="Daily budget (USD)" value={daily} min={0} disabled={!canEdit} onChange={(v) => { setDaily(v ?? 0); }} />
        <NumberField label="Monthly budget (USD)" value={monthly} min={0} disabled={!canEdit} onChange={(v) => { setMonthly(v ?? 0); }} />
        <NumberField label="Per-user daily calls" value={calls} min={0} disabled={!canEdit} onChange={(v) => { setCalls(v ?? 0); }} />
        <NumberField label="Per-task max tokens" value={tokens} min={0} disabled={!canEdit} onChange={(v) => { setTokens(v ?? 0); }} />
      </div>
      {canEdit && <Button className="self-start" onClick={save} loading={pending}>Save budgets</Button>}
    </SettingsSection>
  );
}

export function ModelTiersForm({ initial, canEdit }: { initial: ModelTiers; canEdit: boolean }) {
  const router = useRouter();
  const [fast, setFast] = useState(initial.fast);
  const [balanced, setBalanced] = useState(initial.balanced);
  const [deep, setDeep] = useState(initial.deep);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateModelTiersAction({ ...initial, fast, balanced, deep });
      if (result.ok) { toast.success("Model tiers saved."); router.refresh(); }
      else toast.error(result.error.message);
    });
  }

  return (
    <SettingsSection eyebrow="Models" title="Model tiers" description="Which Claude model backs each tier.">
      <div className="grid gap-6 sm:grid-cols-3">
        <TextField label="Fast" value={fast} mono disabled={!canEdit} onChange={setFast} />
        <TextField label="Balanced" value={balanced} mono disabled={!canEdit} onChange={setBalanced} />
        <TextField label="Deep" value={deep} mono disabled={!canEdit} onChange={setDeep} />
      </div>
      {canEdit && <Button className="self-start" onClick={save} loading={pending}>Save tiers</Button>}
    </SettingsSection>
  );
}
