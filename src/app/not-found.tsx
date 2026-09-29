import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">404</p>
      <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-heading">
        We couldn&apos;t find that page
      </h1>
      <p className="text-lg text-muted">
        The link may be old, or you might not have access. Head back and try again.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
