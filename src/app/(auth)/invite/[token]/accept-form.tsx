"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { Field, PasswordField } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      {error !== null && (
        <div role="alert" aria-live="polite" className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <Field label="Email">
        {({ id }) => (
          <Input id={id} name="email" type="email" value={email} disabled readOnly autoComplete="username" />
        )}
      </Field>
      <Field label="Your name">
        {({ id }) => (
          <Input
            id={id}
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            autoFocus
          />
        )}
      </Field>
      <PasswordField name="password" label="Choose a password" autoComplete="new-password" />
      <Button type="submit" loading={pending} className="w-full">
        Create account
      </Button>
    </form>
  );
}
