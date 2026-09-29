"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { ErrorBanner, InfoBanner, PrimaryButton } from "../../_components/form";
import { PasswordInput } from "../../_components/password-input";

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
      <InfoBanner>Password updated. Redirecting to sign-in&hellip;</InfoBanner>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <ErrorBanner message={error} />
      <PasswordInput name="password" label="New password" autoComplete="new-password" />
      <PrimaryButton type="submit" pending={pending}>
        Update password
      </PrimaryButton>
    </form>
  );
}
