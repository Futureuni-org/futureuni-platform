import { Suspense } from "react";

import { SkeletonRows } from "@/components/patterns/states";
import {
  Alerts,
  Greeting,
  HomeWidgets,
  NeedsYou,
  RecentActivity,
} from "@/components/shell/home";
import { requireUser } from "@/platform/auth";

/**
 * The platform home. Server component. Composed from Editorial Ledger sections: greeting,
 * "needs you", widgets, alerts (role-gated), recent activity. Each `<Suspense>` boundary lets
 * one slow section stream without blocking the rest.
 */
export default async function PlatformHomePage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-12">
      <Greeting name={user.name} timezone={user.timezone} />

      <Suspense fallback={<SkeletonRows rows={2} />}>
        {/* NeedsYou is a server component. */}
        <NeedsYou user={user} />
      </Suspense>

      <Suspense fallback={null}>
        <Alerts user={user} />
      </Suspense>

      <Suspense fallback={<SkeletonRows rows={4} />}>
        <HomeWidgets user={user} />
      </Suspense>

      <Suspense fallback={<SkeletonRows rows={4} />}>
        <RecentActivity user={user} />
      </Suspense>
    </div>
  );
}
