"use client";

import { Section } from "@/components/patterns/section";
import {
  EmptyState,
  ErrorState,
  OfflineBanner,
  PermissionState,
  SkeletonRows,
} from "@/components/patterns/states";
import { Button } from "@/components/ui/button";

export default function StatesGalleryPage() {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Empty">
        <EmptyState
          title="Queue clear"
          description="Nothing waiting on your review right now."
          action={<Button size="sm">Find work</Button>}
        />
      </Section>
      <Section title="Error">
        <ErrorState
          title="Couldn't load your review queue"
          description="The service returned an error. Try again."
          onRetry={() => {
            /* noop demo */
          }}
          detail="500 · Timed out"
        />
      </Section>
      <Section title="Permission">
        <PermissionState
          title="You don't have access to this"
          description="An administrator can grant the permission."
        />
      </Section>
      <Section title="Offline">
        <OfflineBanner />
      </Section>
      <Section title="Skeleton rows">
        <SkeletonRows rows={5} />
      </Section>
    </div>
  );
}
