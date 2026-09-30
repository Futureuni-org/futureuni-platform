import Image from "next/image";

import { cn } from "@/lib/cn";

/**
 * The FUTUREUNI wordmark + mark lockup. Uses the shared `/brand/futureuni-mark.png` asset;
 * theming is done in CSS (colour reads from the surrounding text colour, which flips per theme).
 */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Image
        src="/brand/futureuni-mark.png"
        alt=""
        width={28}
        height={36}
        priority
        className="h-9 w-auto"
      />
      {collapsed !== true && (
        <span className="font-display text-lg font-semibold tracking-[0.02em]">
          FUTUREUNI
        </span>
      )}
    </span>
  );
}
