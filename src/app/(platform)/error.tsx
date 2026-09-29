"use client";

import { ErrorState } from "@/components/patterns/states";

/** Segment error boundary for `(platform)`. Consumes the ErrorState pattern. */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ErrorState
        title="Something went wrong on this page"
        description="Try again. If it keeps happening, an administrator can look at the logs."
        onRetry={reset}
        detail={error.digest ?? error.message}
      />
    </div>
  );
}
