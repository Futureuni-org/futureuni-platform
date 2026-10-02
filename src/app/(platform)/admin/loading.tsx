import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/patterns/states";

/** Skeleton shown while an admin page's data loads. Mirrors the header + content rhythm. */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-full max-w-prose" />
      </div>
      <SkeletonRows rows={6} />
    </div>
  );
}
