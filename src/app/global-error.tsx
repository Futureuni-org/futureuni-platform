"use client";

import { useEffect } from "react";

import { applySavedTheme } from "@/lib/use-theme";
import { fontVariables } from "@/styles/fonts";

import "@/styles/globals.css";

/**
 * Last-resort error page: replaces the root layout when it fails, so it renders its own
 * <html>, styles, fonts and theme. It shows no internals, only the error reference.
 * Minimal on purpose; Phase 4 restyles it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    applySavedTheme();
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <head>
        <title>Something went wrong · FUTUREUNI</title>
      </head>
      <body>
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">FUTUREUNI</p>
          <h1 className="text-4xl leading-tight font-semibold">Something went wrong</h1>
          <p className="text-lg text-muted">
            The page couldn&apos;t load. Try again. If it keeps happening, tell the platform admin
            what you were doing{error.digest === undefined ? "" : " and quote the reference below"}.
          </p>
          {error.digest === undefined ? null : (
            <p className="text-sm text-muted">
              Reference: <code className="font-mono tabular-nums">{error.digest}</code>
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-12 items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
