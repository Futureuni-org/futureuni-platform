"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { PasswordField } from "@/components/admin";
import { Button } from "@/components/ui/button";

import { resetPasswordAction } from "../actions";

export default function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set("token", token);
    startTransition(async () => {
      const result = await resetPasswordAction(data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.push("/login");
      }, 800);
    });
  }

  if (done) {
    return (
      <div className="rounded-md border border-info/40 bg-info-soft px-4 py-3 text-sm text-info">
        Password updated. Redirecting to sign-in&hellip;
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {error !== null && (
        <div role="alert" aria-live="polite" className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <PasswordField name="password" label="New password" autoComplete="new-password" />
      <Button type="submit" loading={pending} className="w-full">
        Update password
      </Button>
    </form>
  );
}
