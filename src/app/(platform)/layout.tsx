/**
 * Placeholder for the signed-in platform shell. Phase 1 created it; Phase 4 replaces it with
 * the real shell (navigation, user menu, notifications).
 */
export default function PlatformLayout({ children }: LayoutProps<"/">) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
