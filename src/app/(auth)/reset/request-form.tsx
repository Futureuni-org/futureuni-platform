"use client";

import Link from "next/link";
import { useState, useTransition, type SyntheticEvent } from "react";

import { Field } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { requestResetAction } from "./actions";

export default function RequestResetForm() {
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      await requestResetAction(data);
      setSent(true);
    });
  }

  if (sent) {
    return (
      <>
        <div className="rounded-md border border-info/40 bg-info-soft px-4 py-3 text-sm text-info">
          If that account exists, we&apos;ve sent a link to reset the password. Check your inbox.
        </div>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          Back to sign-in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field label="Email">
        {({ id }) => (
          <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />
        )}
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Send reset link
      </Button>
      <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
        Back to sign-in
      </Link>
    </form>
  );
}
