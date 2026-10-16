import type { ReactNode } from "react";

/**
 * The client-facing layout (docs/specs/module-forms.md §5). A prospect reaches `/f/<slug>` with no
 * session, so none of the platform shell renders here: no sidebar, no bell, no user menu.
 *
 * It deliberately adds no container of its own. The form owns the whole viewport — a navy brand
 * rail beside the open step on desktop, a navy band above it on a phone — the way the platform's
 * own sign-in owns its page. A wrapper with a max width would box that in.
 */
export default function ClientFormsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
