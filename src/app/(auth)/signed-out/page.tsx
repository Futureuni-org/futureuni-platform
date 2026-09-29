import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signed out" };

export default function SignedOutPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">You&apos;re signed out</h1>
        <p className="text-muted">Sign back in whenever you&apos;re ready.</p>
      </header>
      <Link
        href="/login"
        className="inline-flex h-12 w-fit items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Sign in
      </Link>
    </div>
  );
}
