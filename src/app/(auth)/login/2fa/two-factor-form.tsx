"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { Field } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      const result = mode === "totp" ? await verifyTotpAction(data) : await verifyBackupAction(data);
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
      {error !== null && (
        <div role="alert" aria-live="polite" className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {mode === "totp" ? (
        <Field label="Verification code">
          {({ id }) => (
            <Input
              id={id}
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="one-time-code"
              required
              maxLength={6}
              autoFocus
            />
          )}
        </Field>
      ) : (
        <Field label="Backup code">
          {({ id }) => (
            <Input id={id} name="code" autoComplete="one-time-code" required autoFocus />
          )}
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="trustDevice"
          defaultChecked
          className="size-5 rounded border-input accent-primary"
        />
        Trust this device for 30 days
      </label>
      <Button type="submit" loading={pending} className="w-full">
        Verify
      </Button>
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
