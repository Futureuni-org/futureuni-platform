"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { checkPassword } from "@/platform/auth/password";
import { cn } from "@/lib/cn";

/**
 * PasswordField — a password input with a client strength meter (the server still validates).
 * Works controlled (`value`/`onChange`) and for native form submission (pass `name`). Shared by
 * the auth pages and personal security settings.
 */
export function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete = "new-password",
  required = true,
  showMeter = true,
  error,
}: {
  label: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: "new-password" | "current-password";
  required?: boolean;
  showMeter?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [internal, setInternal] = useState("");
  const current = value ?? internal;
  const check = current === "" ? null : checkPassword(current);
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        required={required}
        minLength={12}
        maxLength={128}
        value={current}
        aria-describedby={error != null ? errId : hintId}
        onChange={(e) => {
          setInternal(e.target.value);
          onChange?.(e.target.value);
        }}
      />
      {showMeter && check !== null && (
        <div className="mt-1 flex items-center gap-2" aria-live="polite">
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((index) => (
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
      )}
      {error != null ? (
        <p id={errId} role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-xs text-muted">
          At least 12 characters. Avoid common patterns.
        </p>
      )}
    </div>
  );
}

function colorFor(score: number): string {
  if (score <= 1) return "bg-danger";
  if (score === 2) return "bg-warning";
  if (score === 3) return "bg-info";
  return "bg-success";
}
