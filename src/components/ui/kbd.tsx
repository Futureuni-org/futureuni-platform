import { cn } from "@/lib/cn";

/** Renders a keyboard shortcut token. Accepts a string like "⌘K" or "g h". */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
