"use client";

import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ActionResult } from "@/lib/result";

export type SecretStatus = "NOT_TESTED" | "OK" | "FAILING";

const STATUS_META: Record<
  SecretStatus,
  { label: string; tone: "neutral" | "success" | "danger"; icon: typeof ShieldCheck }
> = {
  NOT_TESTED: { label: "Not tested", tone: "neutral", icon: ShieldQuestion },
  OK: { label: "OK", tone: "success", icon: ShieldCheck },
  FAILING: { label: "Failing", tone: "danger", icon: ShieldAlert },
};

/**
 * SecretField — INV-21. Shows a masked hint for a stored secret and NEVER reveals the value.
 * The only mutation is replacement: entering a new value overwrites the old one. The input is
 * `type="password"` and `autoComplete="off"`, and nothing in this component ever receives the
 * stored plaintext.
 */
export function SecretField({
  label,
  description,
  configured,
  maskedHint,
  status,
  canEdit = true,
  onSave,
}: {
  label: string;
  description?: string;
  configured: boolean;
  /** A masked hint such as "••••1a2b" — never the real value. */
  maskedHint?: string | null;
  status?: SecretStatus;
  canEdit?: boolean;
  onSave: (value: string) => Promise<ActionResult<unknown>>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    if (value.trim().length === 0) return;
    startTransition(async () => {
      const result = await onSave(value.trim());
      if (result.ok) {
        toast.success(`${label} saved`);
        setValue("");
        setEditing(false);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const statusMeta = status !== undefined ? STATUS_META[status] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-4 text-muted" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          {configured && statusMeta !== null && (
            <Badge tone={statusMeta.tone}>
              <statusMeta.icon aria-hidden className="size-3" />
              {statusMeta.label}
            </Badge>
          )}
        </div>
        {!editing && canEdit && (
          <Button variant="secondary" size="sm" onClick={() => { setEditing(true); }}>
            {configured ? "Replace" : "Add"}
          </Button>
        )}
      </div>

      {description !== undefined && <p className="text-sm text-muted">{description}</p>}

      {!editing ? (
        <p className="font-mono text-sm text-muted">
          {configured ? (maskedHint ?? "••••••••") : "Not configured"}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => { setValue(e.target.value); }}
            placeholder="Enter new value"
            aria-label={`New value for ${label}`}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button onClick={save} loading={pending} disabled={value.trim().length === 0}>
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setValue("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
