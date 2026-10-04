import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/patterns/states";

export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <SkeletonRows rows={8} />
    </div>
  );
}
