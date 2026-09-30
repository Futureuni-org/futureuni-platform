import { cn } from "@/lib/cn";

/** Loading placeholder — a subtle animated block that inherits the parent's layout. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block animate-pulse rounded-md bg-zone",
        className,
      )}
      {...props}
    />
  );
}
