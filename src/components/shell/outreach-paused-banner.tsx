import { TriangleAlert } from "lucide-react";

/**
 * Platform-wide banner shown on every signed-in page when `acquisition.outreach.globalPause` is on
 * (Phase 20, COMP-3). Enforcement lives in the send + assisted paths; this is the operator-facing
 * signal. Pure component (the shell reads the setting and passes `paused`), so it is easy to test.
 */
export function OutreachPausedBanner({ paused }: { paused: boolean }) {
  if (!paused) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-warning/40 bg-warning-soft px-4 py-2.5 text-sm text-warning sm:px-6 lg:px-8"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p>
        <span className="font-semibold">Outreach is paused platform-wide.</span> No emails are sent
        and no assisted links are generated. Drafts can still be reviewed. An admin can resume it in
        settings.
      </p>
    </div>
  );
}
