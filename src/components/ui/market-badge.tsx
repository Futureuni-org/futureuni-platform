import { Globe2 } from "lucide-react";

import type { Market } from "@/contracts/common";
import { cn } from "@/lib/cn";

export function MarketBadge({
  market,
  country,
  className,
}: {
  market: Market;
  country?: string | null;
  className?: string;
}) {
  const label = market === "NIGERIA" ? "Nigeria" : "International";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <Globe2 aria-hidden className="size-3" />
      {label}
      {country !== null && country !== undefined && country !== "" && (
        <span className="font-mono text-muted">{country}</span>
      )}
    </span>
  );
}
