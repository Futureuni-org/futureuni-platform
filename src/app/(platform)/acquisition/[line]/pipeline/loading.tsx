import { Skeleton } from "@/components/ui/skeleton";

/** Matches the board: header, filter row, then a row of stage columns. */
export default function PipelineLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-36" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex w-[85vw] shrink-0 flex-col gap-3 sm:w-72">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
