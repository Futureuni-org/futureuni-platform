import type { Metadata } from "next";

import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">Sign in</h1>
        <p className="text-muted">Welcome back. Use the email your administrator invited.</p>
      </header>
      <LoginForm next={nextValue ?? null} />
    </>
  );
}
