"use client";

/**
 * Local primitives used by every auth form. Kept small and local: Phase 18 restyles them with
 * shared components from the design system (grant in the ownership map).
 */

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  const describedByIds: string[] = [];
  if (hint !== undefined) describedByIds.push(`${htmlFor}-hint`);
  if (error !== undefined) describedByIds.push(`${htmlFor}-error`);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          aria-live="polite"
          className="text-sm text-danger"
        >
          {error}
        </p>
      )}
      <span data-describedby={describedByIds.join(" ") || undefined} hidden />
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          "h-12 rounded-md border border-input bg-surface px-3 text-base text-foreground",
          "outline-none placeholder:text-subtle",
          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      />
    );
  },
);

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
}

export function PrimaryButton({ className, pending, children, ...props }: PrimaryButtonProps) {
  return (
    <button
      {...props}
      disabled={pending === true || props.disabled === true}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-4",
        "font-semibold text-primary-foreground shadow-sm transition-colors",
        "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending === true && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
    />
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      {message}
    </div>
  );
}

export function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-info/40 bg-info-soft px-4 py-3 text-sm text-info">
      {children}
    </div>
  );
}
