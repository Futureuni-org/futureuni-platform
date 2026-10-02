"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { moduleToggleAction, retentionPreviewAction } from "../actions";

export function ModuleToggle({
  moduleId,
  name,
  description,
  enabled,
  canToggle,
}: {
  moduleId: string;
  name: string;
  description: string;
  enabled: boolean;
  canToggle: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await moduleToggleAction(moduleId, next);
      if (result.ok) {
        toast.success(`${name} ${next ? "enabled" : "disabled"}.`);
        router.refresh();
      } else {
        setChecked(!next);
        toast.error(result.error.message);
      }
    });
  }

  return (
    <label className="flex items-start justify-between gap-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-sm text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={!canToggle || pending}
        onChange={(e) => { onChange(e.target.checked); }}
        className="mt-1 size-5 rounded border-input accent-primary"
        aria-label={`Enable ${name}`}
      />
    </label>
  );
}

export function RetentionPreview({ canPreview }: { canPreview: boolean }) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canPreview) return null;

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await retentionPreviewAction();
      if (res.ok) {
        const date = new Date(res.data.cutoff).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        setResult(`${String(res.data.candidates)} closed lead(s) have personal data older than the cutoff (${date}) and would be anonymised.`);
      } else {
        setResult(res.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="sm" className="self-start" onClick={run} loading={pending}>
        Preview purge (dry run)
      </Button>
      {result !== null && <p aria-live="polite" className="text-sm text-muted">{result}</p>}
    </div>
  );
}
