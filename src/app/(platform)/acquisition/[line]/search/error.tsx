"use client";

import { ErrorState } from "@/components/patterns/states";

export default function SearchError({ reset }: { error: Error; reset: () => void }): React.ReactElement {
  return (
    <ErrorState
      title="Couldn't load search"
      description="Something went wrong loading this screen."
      onRetry={reset}
    />
  );
}
