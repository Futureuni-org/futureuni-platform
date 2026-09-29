"use client";

import { fontVariables } from "@/styles/fonts";

/**
 * Root error boundary. Because it renders outside every layout, it re-declares `<html>` and
 * `<body>`. Kept token-only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" data-theme="light" className={fontVariables}>
      <body className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Something broke
          </p>
          <h1 className="font-display text-4xl font-semibold text-heading">
            Sorry — the platform hit an unexpected error
          </h1>
          <p className="text-muted">
            Try again in a moment. If the problem keeps happening, tell an administrator; the
            error id below helps them find the log.
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
            }}
            className="h-12 w-fit rounded-md bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          {error.digest !== undefined && (
            <p className="font-mono text-xs text-muted">Error id: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
