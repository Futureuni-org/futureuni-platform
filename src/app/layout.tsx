import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { Toaster } from "@/components/ui/toaster";
import { ThemeScript } from "@/lib/theme";
import { fontVariables } from "@/styles/fonts";

import "@/styles/globals.css";

// `viewport-fit=cover` lets the mobile bottom navigation pad itself with
// `env(safe-area-inset-bottom)` on notched phones instead of sitting under the home indicator.
// `minimumScale: 1` stops Chromium's mobile auto-zoom-out: with a wide inner scroller (the
// pipeline board), it otherwise expands the layout viewport until the page fits and the page
// loads zoomed out with stretched full-width bars. Zooming in is still allowed.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: { default: "FUTUREUNI", template: "%s · FUTUREUNI" },
  description: "FUTUREUNI's internal platform.",
  // Internal app: never indexed.
  robots: { index: false, follow: false },
  // Until Phase 4 generates the icon set from the approved favicon draft.
  icons: { icon: "/brand/futureuni-mark.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The CSP nonce set by src/proxy.ts, so the inline ThemeScript isn't blocked by the strict
  // `script-src` in production (Phase 20 SEC-2). Reading it opts the layout into dynamic rendering,
  // which a nonce-based CSP requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // data-theme is replaced before paint by ThemeScript; suppressHydrationWarning covers that change.
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript {...(nonce === undefined ? {} : { nonce })} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
