import { cn } from "@/lib/cn";

/**
 * The Editorial Ledger signature detail (Phase 4 visual direction). See `src/styles/README.md`.
 *
 * Wrap any element with `<ReadingRule>` — set `active` when it's the focused / current item.
 * The visual is a 2px-wide, 20px-tall violet rule flush with the left edge; in dark mode it uses
 * `--accent`. Consumers pad-left the content by at least `pl-4` so the rule doesn't overlap it.
 */
export function ReadingRule({
  active,
  className,
  as: Tag = "div",
  children,
  ...rest
}: {
  active?: boolean;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  const Element = Tag as React.ElementType;
  return (
    <Element
      {...rest}
      data-active={active === true ? "true" : undefined}
      className={cn("reading-rule pl-4", className)}
    >
      {children}
    </Element>
  );
}
