/**
 * Minimal public layout (Phase 12): pages with no session, such as the unsubscribe confirmation.
 * It sits inside the root layout (which provides <html>/<body>, fonts and the theme), so it only
 * supplies a centred, on-brand container that works down to 375px.
 */

import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-foreground">
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
