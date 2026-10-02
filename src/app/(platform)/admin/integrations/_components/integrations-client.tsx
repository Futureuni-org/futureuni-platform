"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, KeyRound, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

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
import { ConfirmDialog, Field } from "@/components/admin";
import { RelativeTime } from "@/components/ui/relative-time";
import { deleteCredentialAction, saveCredentialAction, testCredentialAction } from "../actions";

export interface ProviderField {
  name: string;
  label: string;
  secret: boolean;
  optional: boolean;
}
export interface ProviderCardData {
  id: string;
  label: string;
  category: string;
  docsUrl: string;
  signupUrl: string | null;
  fields: ProviderField[];
  configured: boolean;
  status: "NOT_TESTED" | "OK" | "FAILING";
  maskedHint: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
}

const STATUS_META = {
  NOT_TESTED: { tone: "neutral" as const, label: "Not tested", icon: ShieldQuestion },
  OK: { tone: "success" as const, label: "OK", icon: ShieldCheck },
  FAILING: { tone: "danger" as const, label: "Failing", icon: ShieldAlert },
};

export function ProviderCard({
  provider,
  timezone,
  canManage,
  canTest,
}: {
  provider: ProviderCardData;
  timezone: string;
  canManage: boolean;
  canTest: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testing, startTest] = useTransition();
  const meta = STATUS_META[provider.status];

  function test() {
    startTest(async () => {
      const result = await testCredentialAction(provider.id);
      if (result.ok) {
        if (result.data.status === "OK") toast.success(`${provider.label} connection OK.`);
        else toast.error(result.data.error ?? `${provider.label} test failed.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zone px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-4 text-muted" />
          <span className="font-medium text-foreground">{provider.label}</span>
          <Badge tone="neutral">{provider.category}</Badge>
          {provider.configured && (
            <Badge tone={meta.tone}>
              <meta.icon aria-hidden className="size-3" />
              {meta.label}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {provider.configured && canTest && (
            <Button variant="secondary" size="sm" onClick={test} loading={testing}>
              Test
            </Button>
          )}
          {canManage && (
            <Button variant="secondary" size="sm" onClick={() => { setEditOpen(true); }}>
              {provider.configured ? "Replace" : "Add"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="font-mono">{provider.configured ? (provider.maskedHint ?? "••••••••") : "Not configured"}</span>
        {provider.lastTestedAt !== null && (
          <span>
            tested <RelativeTime value={provider.lastTestedAt} timezone={timezone} />
          </span>
        )}
        <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Docs <ExternalLink aria-hidden className="size-3" />
        </a>
        {provider.signupUrl !== null && (
          <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Sign up <ExternalLink aria-hidden className="size-3" />
          </a>
        )}
      </div>

      {provider.status === "FAILING" && provider.lastError !== null && (
        <p className="text-sm text-danger">{provider.lastError}</p>
      )}

      {canManage && (
        <>
          <ReplaceDialog provider={provider} open={editOpen} onOpenChange={setEditOpen} />
          {provider.configured && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => { setDeleteOpen(true); }}>
                Delete credential
              </Button>
            </div>
          )}
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            tone="danger"
            title={`Delete ${provider.label} credential`}
            description="Features that use this provider will stop working until a new credential is added."
            confirmLabel="Delete"
            onConfirm={async () => {
              const result = await deleteCredentialAction(provider.id);
              if (result.ok) { toast.success("Credential deleted."); router.refresh(); }
              return result;
            }}
          />
        </>
      )}
    </div>
  );
}

function ReplaceDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: ProviderCardData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const payload: Record<string, string> = {};
    for (const f of provider.fields) {
      const v = (values[f.name] ?? "").trim();
      if (v !== "") payload[f.name] = v;
    }
    startTransition(async () => {
      const result = await saveCredentialAction(provider.id, payload);
      if (result.ok) {
        toast.success(`${provider.label} credential saved.`);
        setValues({});
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  const requiredFilled = provider.fields
    .filter((f) => !f.optional)
    .every((f) => (values[f.name] ?? "").trim() !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider.configured ? "Replace" : "Add"} {provider.label} credential</DialogTitle>
          <DialogDescription>Stored encrypted; the value is never shown again.</DialogDescription>
        </DialogHeader>
        {provider.fields.map((f) => (
          <Field key={f.name} label={f.label + (f.optional ? " (optional)" : "")}>
            {({ id }) => (
              <Input
                id={id}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.name] ?? ""}
                onChange={(e) => { setValues((v) => ({ ...v, [f.name]: e.target.value })); }}
              />
            )}
          </Field>
        ))}
        {error != null && <p role="alert" aria-live="polite" className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); }} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={!requiredFilled}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
