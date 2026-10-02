"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/result";
import { Field } from "./field";
import { Select, type SelectOption } from "./select";

/**
 * A plain, serialisable description of how to render a setting's control. The owning (server)
 * screen derives this from the setting's Zod schema so this client component never imports the
 * schema itself.
 */
export type SettingFieldDescriptor =
  | { kind: "string"; multiline?: boolean; maxLength?: number }
  | { kind: "number"; min?: number; max?: number; nullable?: boolean }
  | { kind: "boolean" }
  | { kind: "enum"; options: SelectOption[] }
  | { kind: "stringArray" }
  | { kind: "url" }
  | { kind: "json" };

/**
 * SettingField — renders one typed setting from its descriptor: label, description, the current
 * value, and a "reset to default" action when the value isn't already the default. Saving calls
 * the supplied server action, which re-validates against the real Zod schema.
 */
export function SettingField({
  settingKey,
  label,
  description,
  descriptor,
  value,
  defaultValue,
  isDefault,
  canEdit,
  onSave,
}: {
  settingKey: string;
  label: string;
  description?: string;
  descriptor: SettingFieldDescriptor;
  value: unknown;
  defaultValue: unknown;
  isDefault: boolean;
  canEdit: boolean;
  onSave: (key: string, value: unknown) => Promise<ActionResult<unknown>>;
}) {
  const [draft, setDraft] = useState<string>(() => toInput(value, descriptor));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = draft !== toInput(value, descriptor);

  function commit(raw: unknown) {
    setError(null);
    startTransition(async () => {
      const result = await onSave(settingKey, raw);
      if (result.ok) {
        toast.success(`${label} saved`);
      } else {
        setError(result.error.message);
        toast.error(result.error.message);
      }
    });
  }

  function save() {
    let parsed: unknown;
    try {
      parsed = fromInput(draft, descriptor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid value");
      return;
    }
    commit(parsed);
  }

  function resetToDefault() {
    setDraft(toInput(defaultValue, descriptor));
    commit(defaultValue);
  }

  const hint = !isDefault ? (
    <Button
      variant="link"
      size="sm"
      onClick={resetToDefault}
      disabled={!canEdit || pending}
      className="gap-1 text-xs"
    >
      <RotateCcw aria-hidden className="size-3" />
      Reset to default
    </Button>
  ) : undefined;

  // Boolean is a toggle that saves immediately.
  if (descriptor.kind === "boolean") {
    const checked = value === true;
    return (
      <Field label={label} description={description} error={error} hint={hint}>
        {({ id }) => (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              id={id}
              type="checkbox"
              checked={checked}
              disabled={!canEdit || pending}
              onChange={(e) => { commit(e.target.checked); }}
              className="size-5 rounded border-input accent-primary"
            />
            {checked ? "Enabled" : "Disabled"}
          </label>
        )}
      </Field>
    );
  }

  return (
    <Field label={label} description={description} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            {descriptor.kind === "enum" ? (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={draft}
                options={descriptor.options}
                disabled={!canEdit || pending}
                onChange={(e) => { setDraft(e.target.value); }}
              />
            ) : descriptor.kind === "json" ||
              descriptor.kind === "stringArray" ||
              (descriptor.kind === "string" && descriptor.multiline === true) ? (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                value={draft}
                rows={descriptor.kind === "json" ? 6 : 3}
                disabled={!canEdit || pending}
                onChange={(e) => { setDraft(e.target.value); }}
                className={descriptor.kind === "json" ? "font-mono text-sm" : undefined}
              />
            ) : (
              <Input
                id={id}
                aria-describedby={describedBy}
                type={descriptor.kind === "number" ? "number" : descriptor.kind === "url" ? "url" : "text"}
                inputMode={descriptor.kind === "number" ? "numeric" : undefined}
                value={draft}
                disabled={!canEdit || pending}
                onChange={(e) => { setDraft(e.target.value); }}
              />
            )}
          </div>
          {canEdit && (
            <Button onClick={save} loading={pending} disabled={!dirty} className="sm:mt-0">
              Save
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}

function toInput(value: unknown, d: SettingFieldDescriptor): string {
  if (value === null || value === undefined) return "";
  if (d.kind === "stringArray") return Array.isArray(value) ? value.join("\n") : "";
  if (d.kind === "json") return JSON.stringify(value, null, 2);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function fromInput(raw: string, d: SettingFieldDescriptor): unknown {
  const trimmed = raw.trim();
  switch (d.kind) {
    case "number": {
      if (trimmed === "") {
        if (d.nullable === true) return null;
        throw new Error("Enter a number");
      }
      const n = Number(trimmed);
      if (Number.isNaN(n)) throw new Error("Enter a valid number");
      return n;
    }
    case "stringArray":
      return trimmed === ""
        ? []
        : trimmed
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    case "json": {
      if (trimmed === "") throw new Error("Enter valid JSON");
      return JSON.parse(trimmed);
    }
    default:
      return raw;
  }
}
