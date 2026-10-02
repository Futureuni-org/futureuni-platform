"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Select — a styled native `<select>`. Native keeps keyboard, mobile and screen-reader
 * behaviour correct with no extra work; we only restyle the control and add the chevron.
 * 48px tall (h-12), token-only.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    options: SelectOption[];
    placeholder?: string;
  }
>(function Select({ className, options, placeholder, value, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        value={value}
        className={cn(
          "h-12 w-full appearance-none rounded-md border border-input bg-surface pl-3 pr-10 text-base text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
});
