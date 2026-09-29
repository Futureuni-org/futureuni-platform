import type { Metadata } from "next";

import ResetForm from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">Choose a new password</h1>
        <p className="text-muted">Set a new password to sign back in.</p>
      </header>
      <ResetForm token={token} />
    </>
  );
}
