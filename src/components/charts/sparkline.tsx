"use client";

import { useMemo } from "react";

import { serviceLineAccent } from "@/lib/chart-theme";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

/**
 * A tiny inline SVG sparkline. Deliberately built without Recharts so it can be embedded in
 * StatRow cells without pulling in the whole chart runtime. `serviceLine` picks the accent
 * colour when set; otherwise falls back to the current theme's primary.
 */
export function Sparkline({
  data,
  height = 24,
  width = 96,
  serviceLine,
  ariaLabel,
  className,
}: {
  data: readonly number[];
  height?: number;
  width?: number;
  serviceLine?: "WEB_DEVELOPMENT" | "UI_UX_DESIGN" | "GRAPHIC_DESIGN" | "VIDEO_EDITING";
  ariaLabel?: string;
  className?: string;
}) {
  const { theme } = useTheme();
  const path = useMemo(() => buildPath(data, width, height), [data, width, height]);
  const stroke =
    serviceLine === undefined
      ? "var(--primary)"
      : serviceLineAccent(theme, serviceLine);

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? "trend"}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className={cn("overflow-visible", className)}
      style={{ width, height }}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildPath(data: readonly number[], width: number, height: number): string {
  if (data.length === 0) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length === 1 ? width : width / (data.length - 1);
  return data
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
