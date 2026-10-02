"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type SyntheticEvent } from "react";

import { Field } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      {error !== null && (
        <div role="alert" aria-live="polite" className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <Field label="Email">
        {({ id }) => (
          <Input
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            spellCheck={false}
          />
        )}
      </Field>
      <Field label="Password">
        {({ id }) => (
          <Input id={id} name="password" type="password" autoComplete="current-password" required />
        )}
      </Field>
      <div className="flex items-center justify-between text-sm">
        <Link href="/reset" className="font-semibold text-primary hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
