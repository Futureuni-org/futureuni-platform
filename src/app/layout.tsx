import type { Metadata } from "next";
import { headers } from "next/headers";

import { Toaster } from "@/components/ui/toaster";
import { ThemeScript } from "@/lib/theme";
import { fontVariables } from "@/styles/fonts";

import "@/styles/globals.css";

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
