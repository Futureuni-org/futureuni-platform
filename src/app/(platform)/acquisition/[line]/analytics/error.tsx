"use client";

import { ErrorState } from "@/components/patterns";

/** Error boundary for the line analytics page (B3.3): a retry and the digest for support. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Analytics didn't load"
      description="Something went wrong building this report. Try again, or narrow the date range."
      detail={error.digest ?? error.message}
      onRetry={reset}
    />
  );
}
