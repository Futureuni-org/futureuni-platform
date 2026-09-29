import type { Metadata } from "next";

import { requireUser } from "@/platform/auth";

import SetupForm from "./setup-form";

export const metadata: Metadata = { title: "Set up two-factor" };

export default async function Setup2FAPage() {
  const user = await requireUser();
  const required = user.role === "ADMIN" || user.mustSetUp2fa;
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-heading">Set up two-factor</h1>
        <p className="text-muted">
          {required
            ? "Two-factor authentication is required for your role."
            : "Add an authenticator app to protect this account."}
        </p>
      </header>
      <SetupForm alreadyEnabled={user.twoFactorEnabled} />
    </>
  );
}
