"use client";

/**
 * A small segmented control (radio group) for a short set of mutually exclusive options — the
 * market toggle here, and reused for the review focus/list switch. Local to acquisition UI; a
 * candidate to promote into `@/components/ui` (see phases/15/REQUESTS.md).
 */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md bg-zone p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onChange(option.value);
            }}
            className={[
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
              "inline-flex items-center rounded-[0.3rem] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-surface text-heading shadow-soft"
                : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
