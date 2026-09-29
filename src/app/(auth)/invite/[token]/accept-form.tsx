"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { ErrorBanner, Field, PrimaryButton, TextInput } from "../../_components/form";
import { PasswordInput } from "../../_components/password-input";

import { acceptInviteAction } from "./actions";

export default function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set("token", token);
    startTransition(async () => {
      const result = await acceptInviteAction(data);
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
      <ErrorBanner message={error} />
      <Field label="Email" htmlFor="email">
        <TextInput
          id="email"
          name="email"
          type="email"
          value={email}
          disabled
          readOnly
          autoComplete="username"
        />
      </Field>
      <Field label="Your name" htmlFor="name">
        <TextInput
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          autoFocus
        />
      </Field>
      <PasswordInput name="password" label="Choose a password" autoComplete="new-password" />
      <PrimaryButton type="submit" pending={pending}>
        Create account
      </PrimaryButton>
    </form>
  );
}
