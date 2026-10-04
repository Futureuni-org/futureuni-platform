import { Skeleton } from "@/components/ui";
import { SkeletonRows } from "@/components/patterns";

/** Loading state for the line analytics page: header, stat row and chart skeletons (B3.3). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <SkeletonRows rows={6} />
      <SkeletonRows rows={6} />
    </div>
  );
}
