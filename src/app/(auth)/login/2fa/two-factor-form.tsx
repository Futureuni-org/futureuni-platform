"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { ErrorBanner, Field, PrimaryButton, TextInput } from "../../_components/form";

import { verifyBackupAction, verifyTotpAction } from "./actions";

export default function TwoFactorForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result =
        mode === "totp" ? await verifyTotpAction(data) : await verifyBackupAction(data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(result.data.redirect);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <ErrorBanner message={error} />
      {mode === "totp" ? (
        <Field label="Verification code" htmlFor="code">
          <TextInput
            id="code"
            name="code"
            inputMode="numeric"
            pattern="\d{6}"
            autoComplete="one-time-code"
            required
            maxLength={6}
            autoFocus
          />
        </Field>
      ) : (
        <Field label="Backup code" htmlFor="code">
          <TextInput id="code" name="code" autoComplete="one-time-code" required autoFocus />
        </Field>
      )}
      <PrimaryButton type="submit" pending={pending}>
        Verify
      </PrimaryButton>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setError(null);
        }}
        className="text-sm font-semibold text-primary hover:underline"
      >
        {mode === "totp" ? "Use a backup code instead" : "Use an authenticator code instead"}
      </button>
    </form>
  );
}
