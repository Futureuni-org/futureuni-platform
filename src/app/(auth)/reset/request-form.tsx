"use client";

import Link from "next/link";
import { useState, useTransition, type SyntheticEvent } from "react";

import { Field, InfoBanner, PrimaryButton, TextInput } from "../_components/form";

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
        <InfoBanner>
          If that account exists, we&apos;ve sent a link to reset the password. Check your inbox.
        </InfoBanner>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          Back to sign-in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field label="Email" htmlFor="email">
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </Field>
      <PrimaryButton type="submit" pending={pending}>
        Send reset link
      </PrimaryButton>
      <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
        Back to sign-in
      </Link>
    </form>
  );
}
