"use client";

import { ErrorState } from "@/components/patterns/states";

export default function ReviewError({ reset }: { error: Error; reset: () => void }): React.ReactElement {
  return (
    <ErrorState
      title="Couldn't load the review queue"
      description="Something went wrong. Try again."
      onRetry={reset}
    />
  );
}
