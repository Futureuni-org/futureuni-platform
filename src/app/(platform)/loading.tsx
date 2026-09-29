import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/patterns/states";

/**
 * Route-level loading skeleton for `(platform)`. Mirrors the platform home's layout so the
 * transition doesn't shift content around. Individual pages can add their own `loading.tsx`.
 */
export default function PlatformLoading() {
  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-72 md:h-14" />
        <Skeleton className="h-3 w-48" />
      </div>
      <SkeletonRows rows={2} />
      <SkeletonRows rows={5} />
    </div>
  );
}
