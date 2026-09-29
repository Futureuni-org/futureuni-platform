import type { Money as MoneyType } from "@/contracts/common";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

/** Renders a `Money` value as mono tabular, right-aligned by default. */
export function Money({
  value,
  compact,
  showMinor = "auto",
  className,
}: {
  value: MoneyType;
  compact?: boolean;
  showMinor?: "auto" | "always";
  className?: string;
}) {
  const opts: { compact?: boolean; showMinor?: "auto" | "always" } = { showMinor };
  if (compact === true) opts.compact = true;
  return (
    <span className={cn("font-mono tabular-nums", className)}>{formatMoney(value, opts)}</span>
  );
}
