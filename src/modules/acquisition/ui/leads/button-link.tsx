import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * A link that looks like `@/components/ui` Button. Button has no `asChild` and doesn't export its
 * variants, and a `<button>` inside an `<a>` is invalid HTML, so navigation actions use this. The
 * classes mirror Button's. Listed in phases/16/REQUESTS.md: give Button an `asChild` (or export
 * `buttonVariants`) and delete this.
 */

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-surface text-foreground border border-input hover:bg-primary-soft",
  ghost: "text-foreground hover:bg-primary-soft",
} as const;

const SIZE = { sm: "h-9 px-3", md: "h-12 px-5" } as const;

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
}) {
  return <Link className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...props} />;
}

/**
 * The same look on a plain `<a>`, for a file the browser should download (a CSV export, a signed
 * file URL). A route handler that answers with a file is not a page, so it must not go through the
 * client router the way `Link` does.
 */
export function DownloadLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"a"> & {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
}) {
  return (
    <a className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...props}>
      {children}
    </a>
  );
}
