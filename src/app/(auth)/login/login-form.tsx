"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { ErrorBanner, Field, PrimaryButton, TextInput } from "../_components/form";

import { signInWithPassword } from "./actions";

export default function LoginForm({ next }: { next: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await signInWithPassword(form);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(result.data.redirect);
      router.refresh();
    });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <ErrorBanner message={error} />
      <Field label="Email" htmlFor="email">
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          spellCheck={false}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <Link href="/reset" className="font-semibold text-primary hover:underline">
          Forgot your password?
        </Link>
      </div>
      <PrimaryButton type="submit" pending={pending}>
        Sign in
      </PrimaryButton>
    </form>
  );
}
