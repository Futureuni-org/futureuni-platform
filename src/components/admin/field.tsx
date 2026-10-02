"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Field — label + optional description + inline error wrapper around a single control.
 * The control receives `id` and aria wiring through a render prop so native and custom
 * controls both stay accessible. Errors use `role="alert"` with `aria-live="polite"`.
 */
export function Field({
  label,
  description,
  error,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  description?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Optional trailing hint shown to the right of the label (e.g. "Admin only"). */
  hint?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const errId = `${id}-err`;
  const describedBy =
    [description !== undefined ? descId : null, error != null ? errId : null]
      .filter((v): v is string => v !== null)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required === true && (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          )}
        </label>
        {hint !== undefined && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {description !== undefined && (
        <p id={descId} className="text-sm text-muted">
          {description}
        </p>
      )}
      {children({ id, describedBy })}
      {error != null && (
        <p id={errId} role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
