import Link from "next/link";
import { PauseCircle, TriangleAlert } from "lucide-react";

/**
 * A small, clear banner shown when a line's outreach throttle is SLOW or PAUSED. Colour is always
 * paired with an icon and a label (never colour alone). Links to the capacity view the viewer can
 * open (team capacity for admins/managers, the line's own capacity for everyone else, M15-AC2).
 */

export function CapacityBanner({
  mode,
  lineLabel,
  href,
  linkLabel,
}: {
  mode: "SLOW" | "PAUSED";
  lineLabel: string;
  href: string;
  linkLabel: string;
}): React.ReactElement {
  const paused = mode === "PAUSED";
  const Icon = paused ? PauseCircle : TriangleAlert;
  return (
    <div
      role="status"
      className={[
        "flex flex-col gap-2 rounded-md px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        paused
          ? "bg-danger-soft text-danger"
          : "bg-warning-soft text-warning",
      ].join(" ")}
    >
      <p className="flex items-start gap-2 font-medium">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {paused ? (
            <>
              {lineLabel} is at capacity. New first touches are paused; conversations already under
              way continue.
            </>
          ) : (
            <>
              {lineLabel} is busy. New first-touch outreach is throttled to protect deliverability.
            </>
          )}
        </span>
      </p>
      <Link
        href={href}
        className="shrink-0 font-semibold underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {linkLabel}
      </Link>
    </div>
  );
}
