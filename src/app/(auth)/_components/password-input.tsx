"use client";

import { useMemo, useState } from "react";

import { checkPassword } from "@/platform/auth/password";
import { cn } from "@/lib/cn";

import { Field, TextInput } from "./form";

/**
 * A password input with a compact strength meter and hint text. Server-side validation is still
 * the authority (`checkPassword` runs there too); the meter is a convenience.
 */
export function PasswordInput({
  name,
  label,
  required,
  autoComplete,
}: {
  name: string;
  label: string;
  required?: boolean;
  autoComplete?: "new-password" | "current-password";
}) {
  const [value, setValue] = useState("");
  const check = useMemo(() => (value === "" ? null : checkPassword(value)), [value]);

  return (
    <Field
      label={label}
      hint="At least 12 characters. Avoid common patterns."
      htmlFor={name}
    >
      <TextInput
        id={name}
        name={name}
        type="password"
        autoComplete={autoComplete ?? "new-password"}
        required={required ?? true}
        minLength={12}
        maxLength={128}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <StrengthMeter check={check} />
    </Field>
  );
}

function StrengthMeter({
  check,
}: {
  check: ReturnType<typeof checkPassword> | null;
}) {
  if (check === null) return null;
  const bars = [0, 1, 2, 3];
  return (
    <div className="mt-1 flex items-center gap-2" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {bars.map((index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 w-8 rounded-full",
              check.score > index ? colorFor(check.score) : "bg-border",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted">Strength: {check.label}</span>
    </div>
  );
}

function colorFor(score: number): string {
  if (score <= 1) return "bg-danger";
  if (score === 2) return "bg-warning";
  if (score === 3) return "bg-info";
  return "bg-success";
}
