import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/patterns/states";

/** Matches the lead-detail layout: header, tab strip, main column and side rail. */
export default function LeadDetailLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-72 max-w-full" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-10 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
          <SkeletonRows rows={5} />
        </div>
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <SkeletonRows rows={4} />
        </div>
      </div>
    </div>
  );
}
