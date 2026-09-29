import type { Metadata } from "next";

import TwoFactorForm from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor sign-in" };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">
          Two-factor authentication
        </h1>
        <p className="text-muted">Enter the 6-digit code from your authenticator app.</p>
      </header>
      <TwoFactorForm next={nextValue ?? null} />
    </>
  );
}
