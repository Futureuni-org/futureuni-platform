"use client";

/**
 * The field primitives the public form renders (docs/specs/module-forms.md §6, §7).
 *
 * They live in the module rather than `@/components/ui` because they are driven by a
 * `FormField` contract, not by props a designer picks — a module must not edit the platform's
 * primitive library. They compose the platform's `Input` and `Textarea`, so a token change in the
 * design system still reaches this form.
 *
 * Accessibility: every control has a real label; choice groups are a fieldset with a legend; help
 * text and errors are wired with `aria-describedby`, and an error is never signalled by colour
 * alone — it carries text.
 */

import { AlertCircle } from "lucide-react";

import type { FormAnswer, FormField } from "@/contracts/forms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

export interface FieldProps {
  field: FormField;
  value: FormAnswer | undefined;
  error: string | null;
  onChange: (value: FormAnswer) => void;
}

const INPUT_TYPE: Partial<Record<FormField["kind"], string>> = {
  shortText: "text",
  email: "email",
  phone: "tel",
  url: "url",
};

const AUTOCOMPLETE: Partial<Record<string, string>> = {
  contactName: "name",
  contactEmail: "email",
  contactPhone: "tel",
};

function asText(value: FormAnswer | undefined): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : value.join(", ");
}

function asList(value: FormAnswer | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

/** The question, its help text and its error, around whichever control the kind needs. */
export function Field({ field, value, error, onChange }: FieldProps) {
  const id = `f-${field.key}`;
  const helpId = field.help === undefined ? undefined : `${id}-help`;
  const errorId = error === null ? undefined : `${id}-error`;
  const describedBy = [helpId, errorId].filter((part) => part !== undefined).join(" ") || undefined;
  const isChoice = field.kind === "singleChoice" || field.kind === "multiChoice";

  return (
    <div
      data-field={field.key}
      className={cn(
        "flex flex-col gap-2",
        field.width === "half" && "sm:col-span-1",
        "col-span-full",
      )}
    >
      {isChoice ? (
        <fieldset
          className="flex flex-col gap-3"
          aria-describedby={describedBy}
          aria-invalid={error === null ? undefined : "true"}
        >
          <legend className="flex flex-col gap-1">
            <span className="text-base font-medium text-heading">
              {field.label}
              {field.required === true && <RequiredMark />}
            </span>
            {field.help !== undefined && <Help id={helpId}>{field.help}</Help>}
          </legend>
          {error !== null && <FieldError id={errorId}>{error}</FieldError>}
          <Choices field={field} value={value} onChange={onChange} />
        </fieldset>
      ) : (
        <>
          <label htmlFor={id} className="flex flex-col gap-1">
            <span className="text-base font-medium text-heading">
              {field.label}
              {field.required === true && <RequiredMark />}
            </span>
            {field.help !== undefined && <Help id={helpId}>{field.help}</Help>}
          </label>
          {error !== null && <FieldError id={errorId}>{error}</FieldError>}
          {field.kind === "longText" ? (
            <Textarea
              id={id}
              name={field.key}
              value={asText(value)}
              maxRows={14}
              {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
              aria-describedby={describedBy}
              aria-invalid={error === null ? undefined : "true"}
              onChange={(event) => {
                onChange(event.target.value);
              }}
            />
          ) : (
            <Input
              id={id}
              name={field.key}
              type={INPUT_TYPE[field.kind] ?? "text"}
              value={asText(value)}
              {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
              {...(field.role !== undefined && AUTOCOMPLETE[field.role] !== undefined
                ? { autoComplete: AUTOCOMPLETE[field.role] }
                : {})}
              aria-describedby={describedBy}
              aria-invalid={error === null ? undefined : "true"}
              onChange={(event) => {
                onChange(event.target.value);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="ml-2 align-middle text-xs font-semibold tracking-[0.06em] text-muted uppercase">
      Required
    </span>
  );
}

function Help({ id, children }: { id: string | undefined; children: string }) {
  return (
    <span id={id} className="text-sm leading-relaxed text-muted">
      {children}
    </span>
  );
}

function FieldError({ id, children }: { id: string | undefined; children: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm font-medium text-danger">
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

/** Radio or checkbox options, as full-width tap targets. */
function Choices({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: FormAnswer | undefined;
  onChange: (value: FormAnswer) => void;
}) {
  const multiple = field.kind === "multiChoice";
  const selected = new Set(asList(value));

  return (
    <div className="flex flex-col gap-2">
      {(field.choices ?? []).map((choice) => {
        const checked = selected.has(choice.value);
        return (
          <label
            key={choice.value}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 py-3",
              "transition-colors",
              checked
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "border-input bg-surface text-foreground hover:bg-zone",
              "focus-within:ring-2 focus-within:ring-ring",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={field.key}
              value={choice.value}
              checked={checked}
              className="size-5 shrink-0 accent-[var(--primary)]"
              onChange={(event) => {
                if (!multiple) {
                  onChange(choice.value);
                  return;
                }
                const next = new Set(selected);
                if (event.target.checked) next.add(choice.value);
                else next.delete(choice.value);
                onChange([...next]);
              }}
            />
            <span className="text-base">{choice.label}</span>
          </label>
        );
      })}
    </div>
  );
}
