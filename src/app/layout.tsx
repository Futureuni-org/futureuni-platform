import type { Metadata } from "next";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is replaced before paint by ThemeScript; suppressHydrationWarning covers that change.
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
