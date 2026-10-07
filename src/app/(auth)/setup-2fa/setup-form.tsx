"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState, useTransition, type SyntheticEvent } from "react";

import { Field } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { startEnable2FA, verifyEnable2FA } from "./actions";

type Stage =
  | { kind: "password" }
  | { kind: "verify"; totpUri: string; secret: string; backupCodes: string[] }
  | { kind: "done"; backupCodes: string[] };

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-info/40 bg-info-soft px-4 py-3 text-sm text-info">
      {children}
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (error === null) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      {error}
    </div>
  );
}

export default function SetupForm({ alreadyEnabled }: { alreadyEnabled: boolean }) {
  const [stage, setStage] = useState<Stage>({ kind: "password" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (alreadyEnabled && stage.kind === "password") {
    return (
      <Notice>
        Two-factor authentication is already enabled. Ask an administrator to reset it if you need
        to change devices.
      </Notice>
    );
  }

  function onPasswordSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await startEnable2FA(data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStage({
        kind: "verify",
        totpUri: result.data.totpUri,
        secret: result.data.secret,
        backupCodes: result.data.backupCodes,
      });
    });
  }

  function onVerifySubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await verifyEnable2FA(data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (stage.kind === "verify") {
        setStage({ kind: "done", backupCodes: stage.backupCodes });
      }
    });
  }

  if (stage.kind === "password") {
    return (
      <form onSubmit={onPasswordSubmit} className="flex flex-col gap-5" noValidate>
        <ErrorText error={error} />
        <Field label="Confirm your password">
          {({ id }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" loading={pending} className="w-full">
          Continue
        </Button>
      </form>
    );
  }

  if (stage.kind === "verify") {
    return (
      <form onSubmit={onVerifySubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-surface p-4">
          <p className="w-full text-sm text-muted">
            Scan this QR code with your authenticator app (Google Authenticator, 1Password, etc.).
          </p>
          {/* QR renders black-on-white (qrcode.react defaults) with a 4-module quiet zone so it
              scans reliably on any theme; its own white background is not a themeable surface. */}
          <div className="overflow-hidden rounded-lg">
            <QRCodeSVG
              value={stage.totpUri}
              size={180}
              level="M"
              marginSize={4}
              title="Two-factor setup QR code"
            />
          </div>
          <details className="w-full">
            <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
              Can&apos;t scan? Enter the key manually
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <p className="w-full font-mono text-xs break-all text-muted">
                Key: <span className="text-foreground">{stage.secret}</span>
              </p>
              <a
                href={stage.totpUri}
                className="w-full font-mono text-xs break-all text-primary underline decoration-dotted"
              >
                {stage.totpUri}
              </a>
            </div>
          </details>
        </div>
        <ErrorText error={error} />
        <Field label="Enter the 6-digit code">
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
        <Button type="submit" loading={pending} className="w-full">
          Enable two-factor
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Notice>Two-factor authentication is on. Save your backup codes now.</Notice>
      <ol className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface p-4 font-mono text-sm">
        {stage.backupCodes.map((code) => (
          <li key={code} className="text-foreground">
            {code}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        Each backup code works once. Store them somewhere only you can access.
      </p>
      <Button
        type="button"
        className="w-full"
        onClick={() => {
          router.push("/");
          router.refresh();
        }}
      >
        I&apos;ve saved my codes
      </Button>
      <Link href="/" className="text-sm text-muted hover:underline">
        Skip for now
      </Link>
    </div>
  );
}
