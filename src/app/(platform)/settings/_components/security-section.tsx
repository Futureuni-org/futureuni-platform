"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection, DangerZone, DangerRow, Field, PasswordField } from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  changePasswordAction,
  disable2faAction,
  regenerateBackupCodesAction,
  start2faAction,
  verify2faAction,
} from "../actions";

export function SecuritySection({
  twoFactorEnabled,
  isAdmin,
}: {
  twoFactorEnabled: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-10">
      <ChangePassword />
      <TwoFactor enabled={twoFactorEnabled} isAdmin={isAdmin} />
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await changePasswordAction(current, next);
      if (result.ok) {
        toast.success("Password changed. Other sessions were signed out.");
        setCurrent("");
        setNext("");
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <SettingsSection eyebrow="Security" title="Change password" emphasized>
      <Field label="Current password">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
            }}
          />
        )}
      </Field>
      <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
      {error != null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        className="self-start"
        onClick={submit}
        loading={pending}
        disabled={current === "" || next === ""}
      >
        Change password
      </Button>
    </SettingsSection>
  );
}

function TwoFactor({ enabled, isAdmin }: { enabled: boolean; isAdmin: boolean }) {
  const [enableOpen, setEnableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  return (
    <SettingsSection eyebrow="Security" title="Two-factor authentication">
      <div className="flex items-center gap-2">
        {enabled ? (
          <Badge tone="success">
            <ShieldCheck aria-hidden className="size-3" /> On
          </Badge>
        ) : (
          <Badge tone="warning">
            <ShieldOff aria-hidden className="size-3" /> Off
          </Badge>
        )}
        <span className="text-sm text-muted">
          {enabled
            ? "An authenticator app is required at sign-in."
            : "Add an authenticator app for a second step at sign-in."}
        </span>
      </div>

      {!enabled ? (
        <Button
          className="self-start"
          onClick={() => {
            setEnableOpen(true);
          }}
        >
          Set up two-factor
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setRegenOpen(true);
            }}
          >
            Regenerate backup codes
          </Button>
        </div>
      )}

      {enabled && !isAdmin && (
        <DangerZone description="Turning off two-factor makes your account easier to compromise.">
          <DangerRow
            title="Disable two-factor"
            description="You'll sign in with just your password."
            action={
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDisableOpen(true);
                }}
              >
                Disable
              </Button>
            }
          />
        </DangerZone>
      )}
      {enabled && isAdmin && (
        <p className="text-sm text-muted">
          Administrators can&apos;t disable two-factor. Ask another admin to reset it if you&apos;re
          locked out.
        </p>
      )}

      <Enable2faDialog open={enableOpen} onOpenChange={setEnableOpen} />
      <PasswordGatedCodesDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Regenerate backup codes"
        description="Your old backup codes stop working. Save the new ones somewhere safe."
        run={regenerateBackupCodesAction}
      />
      <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </SettingsSection>
  );
}

function Enable2faDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">{open && <Enable2faBody onOpenChange={onOpenChange} />}</DialogContent>
    </Dialog>
  );
}

function Enable2faBody({ onOpenChange }: { onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<"password" | "verify">("password");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ totpUri: string; secret: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await start2faAction(password);
      if (result.ok) {
        setSetup(result.data);
        setStage("verify");
      } else {
        setError(result.error.message);
      }
    });
  }

  function verify() {
    setError(null);
    startTransition(async () => {
      const result = await verify2faAction(code);
      if (result.ok) {
        toast.success("Two-factor is on.");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Set up two-factor</DialogTitle>
        <DialogDescription>
          {stage === "password"
            ? "Confirm your password to begin."
            : "Add the key to your authenticator app, then enter the 6-digit code."}
        </DialogDescription>
      </DialogHeader>

      {stage === "password" ? (
        <Field label="Current password">
          {({ id }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          )}
        </Field>
      ) : (
        setup !== null && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Authenticator key</span>
              <code className="break-all rounded-md bg-zone p-2 font-mono text-xs">{setup.secret}</code>
              <a href={setup.totpUri} className="text-sm text-primary hover:underline">
                Open in your authenticator app
              </a>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Backup codes (save these)</span>
              <ul className="grid grid-cols-2 gap-1 rounded-md bg-zone p-2 font-mono text-xs">
                {setup.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <Field label="6-digit code">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                  }}
                />
              )}
            </Field>
          </div>
        )
      )}

      {error != null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        {stage === "password" ? (
          <Button onClick={start} loading={pending} disabled={password === ""}>
            Continue
          </Button>
        ) : (
          <Button onClick={verify} loading={pending} disabled={code.length !== 6}>
            Enable two-factor
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function PasswordGatedCodesDialog({
  open,
  onOpenChange,
  title,
  description,
  run,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  run: (password: string) => Promise<
    { ok: true; data: { backupCodes: string[] } } | { ok: false; error: { message: string } }
  >;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && <CodesBody title={title} description={description} run={run} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function CodesBody({
  title,
  description,
  run,
  onOpenChange,
}: {
  title: string;
  description: string;
  run: (password: string) => Promise<
    { ok: true; data: { backupCodes: string[] } } | { ok: false; error: { message: string } }
  >;
  onOpenChange: (o: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      const result = await run(password);
      if (result.ok) {
        setCodes(result.data.backupCodes);
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {codes === null ? (
        <>
          <Field label="Current password">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            )}
          </Field>
          {error != null && (
            <p role="alert" aria-live="polite" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => { onOpenChange(false); }} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={go} loading={pending} disabled={password === ""}>
              Continue
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-1 rounded-md bg-zone p-2 font-mono text-xs">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => { onOpenChange(false); }}>Done</Button>
          </DialogFooter>
        </>
      )}
    </>
  );
}

function DisableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <DisableBody
            onOpenChange={onOpenChange}
            onDone={() => {
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DisableBody({ onOpenChange, onDone }: { onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      const result = await disable2faAction(password);
      if (result.ok) {
        toast.success("Two-factor disabled.");
        onOpenChange(false);
        onDone();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Disable two-factor</DialogTitle>
        <DialogDescription>Confirm your password to turn off two-factor authentication.</DialogDescription>
      </DialogHeader>
      <Field label="Current password">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        )}
      </Field>
      {error != null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={() => { onOpenChange(false); }} disabled={pending}>
          Cancel
        </Button>
        <Button variant="danger" onClick={go} loading={pending} disabled={password === ""}>
          Disable
        </Button>
      </DialogFooter>
    </>
  );
}
