import type { Metadata } from "next";

import RequestResetForm from "./request-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ResetPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">Reset your password</h1>
        <p className="text-muted">
          Enter your email and we&apos;ll send a reset link if that account exists.
        </p>
      </header>
      <RequestResetForm />
    </>
  );
}
