import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

/** Every unmatched URL. Minimal on purpose; Phase 4 restyles it. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Error 404</p>
      <h1 className="text-4xl leading-tight font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-lg text-muted">The link may be out of date, or the page may have moved.</p>
      <div>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground"
        >
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
