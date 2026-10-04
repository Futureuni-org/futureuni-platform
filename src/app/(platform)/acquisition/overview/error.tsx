"use client";

import { ErrorState } from "@/components/patterns";

/** Error boundary for the overview page (B3.3). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="The overview didn't load"
      description="Something went wrong building the cross-line view. Try again, or narrow the date range."
      detail={error.digest ?? error.message}
      onRetry={reset}
    />
  );
}
