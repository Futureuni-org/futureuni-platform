"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, type SelectOption } from "@/components/admin";
import { cn } from "@/lib/cn";

export function TextField({
  label,
  value,
  onChange,
  description,
  placeholder,
  disabled,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <Field label={label} description={description}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={cn(mono === true && "font-mono")}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  description,
  placeholder,
  disabled,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <Field label={label} description={description}>
      {({ id, describedBy }) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      )}
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  description,
  min,
  max,
  disabled,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  description?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <Field label={label} description={description}>
      {({ id, describedBy }) => (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            aria-describedby={describedBy}
            type="number"
            inputMode="numeric"
            value={value === null ? "" : String(value)}
            min={min}
            max={max}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange(v === "" ? null : Number(v));
            }}
            className="max-w-40"
          />
          {suffix !== undefined && <span className="text-sm text-muted">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  description,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  description?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} description={description}>
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value}
          options={options}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  description,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="mt-0.5 size-5 rounded border-input accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-foreground">{label}</span>
        {description !== undefined && <span className="text-muted">{description}</span>}
      </span>
    </label>
  );
}

/** Toggleable chips for a multi-select (markets, stop conditions, …). */
export function ChipMultiSelect({
  label,
  values,
  options,
  onChange,
  disabled,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                toggle(o.value);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors disabled:opacity-60",
                active
                  ? "bg-primary-soft text-primary-soft-foreground"
                  : "bg-zone text-muted hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A newline/comma-separated list editor backed by a textarea (tags, phrases, includes…). */
export function StringListField({
  label,
  values,
  onChange,
  description,
  placeholder,
  disabled,
  lowercaseSlug,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Keep only slug characters (for tags / proof tags). */
  lowercaseSlug?: boolean;
}) {
  return (
    <Field label={label} description={description}>
      {({ id, describedBy }) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          value={values.join("\n")}
          rows={Math.min(Math.max(values.length + 1, 2), 8)}
          placeholder={placeholder ?? "One per line"}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value
              .split(/[\n,]/)
              .map((s) => (lowercaseSlug === true ? s.trim().toLowerCase() : s.trim()))
              .filter((s) => s.length > 0);
            onChange(next);
          }}
        />
      )}
    </Field>
  );
}

/** A JSON object editor. Updates the draft only when the text parses to an object. */
export function JsonObjectField({
  label,
  value,
  onChange,
  description,
  disabled,
  rows = 5,
}: {
  label: string;
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
  description?: string;
  disabled?: boolean;
  rows?: number;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  function onEdit(next: string) {
    setText(next);
    try {
      const parsed: unknown = next.trim() === "" ? {} : JSON.parse(next);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setError("Must be a JSON object");
        return;
      }
      setError(null);
      onChange(parsed as Record<string, unknown>);
    } catch {
      setError("Invalid JSON");
    }
  }

  return (
    <Field label={label} description={description} error={error}>
      {({ id, describedBy }) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          value={text}
          rows={rows}
          disabled={disabled}
          onChange={(e) => {
            onEdit(e.target.value);
          }}
          className="font-mono text-xs"
        />
      )}
    </Field>
  );
}

/** A zone band wrapping one item of a repeatable list, with a remove button. */
export function ItemCard({
  title,
  badge,
  onRemove,
  canEdit,
  children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  onRemove?: (() => void) | undefined;
  canEdit: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-zone px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {badge}
        </div>
        {canEdit && onRemove !== undefined && (
          <IconButton aria-label="Remove" onClick={onRemove} className="text-danger">
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        )}
      </div>
      {children}
    </div>
  );
}

export function AddButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="secondary" size="sm" className="gap-2 self-start" onClick={onClick} disabled={disabled}>
      <Plus aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
