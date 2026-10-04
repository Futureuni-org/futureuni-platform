"use client";

import { useId } from "react";

import { LIMIT_PRESETS } from "./types";

/**
 * Result-limit control: preset quick-picks (25 / 50 / 100 / 250) backed by a range slider. The
 * slider snaps to 25s. Local to acquisition UI; a promote candidate (see phases/15/REQUESTS.md).
 */

export function LimitSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          Result limit
        </label>
        <span className="font-mono text-sm tabular-nums text-heading">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={25}
        max={250}
        step={25}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        style={{ accentColor: "var(--primary)" }}
        className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <div className="flex gap-1.5">
        {LIMIT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value === preset}
            onClick={() => {
              onChange(preset);
            }}
            className={[
              "inline-flex h-8 flex-1 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              value === preset
                ? "bg-primary-soft text-primary-soft-foreground"
                : "bg-zone text-muted hover:text-foreground",
            ].join(" ")}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
