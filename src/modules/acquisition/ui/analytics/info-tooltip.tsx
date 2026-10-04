"use client";

import { Info } from "lucide-react";

import { Tooltip } from "@/components/ui";

/**
 * An info icon that shows a metric's plain-language definition on hover or focus (Phase 17; every
 * chart carries one). Keyboard reachable with a visible focus ring and an accessible label.
 */
export function InfoTooltip({ label }: { label: string }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={`What this means: ${label}`}
        className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info aria-hidden className="size-4" />
      </button>
    </Tooltip>
  );
}
