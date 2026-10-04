"use client";

import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

import { useUrlParams } from "./use-url-params";

/** An on/off filter chip kept in the URL as `?<paramKey>=1`. */
export function UrlToggle({ paramKey, label }: { paramKey: string; label: string }) {
  const searchParams = useSearchParams();
  const setParams = useUrlParams();
  const on = searchParams.get(paramKey) === "1";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setParams({ [paramKey]: on ? null : "1" });
      }}
      className={cn(
        "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        on
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-border text-muted hover:text-foreground",
      )}
    >
      {/* A filter that is on is marked by the tick as well as the colour. */}
      {on && <Check aria-hidden className="size-4" />}
      {label}
    </button>
  );
}
