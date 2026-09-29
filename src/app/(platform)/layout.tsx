import { ShellLayout } from "@/components/shell";

/**
 * Platform (signed-in) layout. Every route under `(platform)` renders inside the shell:
 * sidebar + top bar + notification bell + user menu on desktop, bottom nav on mobile.
 *
 * The shell calls `getCurrentUser()` from `@/platform/auth` and redirects to `/login` if the
 * session has expired. `src/proxy.ts` already redirects anonymous requests before the layout
 * runs — this is defence in depth.
 */
export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return <ShellLayout>{children}</ShellLayout>;
}
