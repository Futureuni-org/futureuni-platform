"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Sonner-powered toast layer. Mounted once from the root layout. Uses the FUTUREUNI tokens by
 * pointing sonner at CSS variables so it flips with the theme automatically.
 */
export function Toaster() {
  return (
    <SonnerToaster
      theme="system"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg bg-elevated text-foreground shadow-lift border border-border",
          description: "text-muted",
          title: "font-semibold",
        },
      }}
    />
  );
}
