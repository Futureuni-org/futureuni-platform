import { Skeleton } from "@/components/ui";
import { SkeletonRows } from "@/components/patterns";

/** Loading state for the overview: header, comparison and panel skeletons (B3.3). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
      <SkeletonRows rows={5} />
    </div>
  );
}
