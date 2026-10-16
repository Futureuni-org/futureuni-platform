import type { ReactNode } from "react";

/**
 * The client-facing layout (docs/specs/module-forms.md §5). A prospect reaches `/f/<slug>` with no
 * session, so none of the platform shell renders here: no sidebar, no bell, no user menu.
 *
 * Its own route group, rather than `(public)`, because `(public)` is a narrow centred card for the
 * unsubscribe page and a brief needs a reading column that works from 375px up.
 */
export default function ClientFormsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-24 sm:px-6 sm:pt-16">{children}</div>
    </div>
  );
}
