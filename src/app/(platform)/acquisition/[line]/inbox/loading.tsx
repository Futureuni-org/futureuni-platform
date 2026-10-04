import { Skeleton } from "@/components/ui/skeleton";

const ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

/** Matches the inbox: header, filters, then the thread list beside the conversation. */
export default function InboxLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-2">
          {ROWS.map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
