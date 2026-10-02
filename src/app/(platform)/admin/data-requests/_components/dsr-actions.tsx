"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog, Field, Select } from "@/components/admin";
import { createDsrAction, fulfilDeleteAction, fulfilExportAction } from "../actions";

type DsrType = "EXPORT" | "DELETE";

export function CreateDsrDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DsrType>("EXPORT");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createDsrAction({ type, email, phone, requestedBy, notes });
      if (result.ok) {
        toast.success("Data request recorded.");
        setEmail("");
        setPhone("");
        setRequestedBy("");
        setNotes("");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus aria-hidden className="size-4" />
          New request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New data-subject request</DialogTitle>
          <DialogDescription>
            Record an export or deletion request. Provide an email or a phone number to identify the
            subject.
          </DialogDescription>
        </DialogHeader>
        <Field label="Type">
          {({ id }) => (
            <Select
              id={id}
              value={type}
              onChange={(e) => {
                setType(e.target.value as DsrType);
              }}
              options={[
                { value: "EXPORT", label: "Export" },
                { value: "DELETE", label: "Delete" },
              ]}
            />
          )}
        </Field>
        <Field label="Subject email">
          {({ id }) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="name@example.com"
            />
          )}
        </Field>
        <Field label="Subject phone">
          {({ id }) => (
            <Input
              id={id}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
              placeholder="+234…"
            />
          )}
        </Field>
        <Field label="Requested by" description="Who asked, for the record.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={requestedBy}
              onChange={(e) => {
                setRequestedBy(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Notes">
          {({ id }) => (
            <Textarea
              id={id}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              rows={2}
            />
          )}
        </Field>
        {error != null && (
          <p role="alert" aria-live="polite" className="text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={requestedBy.trim() === ""}>
            Record request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FulfilExportButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await fulfilExportAction(id);
      if (result.ok) {
        toast.success("Export ready. Opening the download…", { duration: 8000 });
        window.open(result.data.url, "_blank", "noopener,noreferrer");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Button variant="secondary" size="sm" className="gap-1" onClick={run} loading={pending}>
      <Download aria-hidden className="size-4" />
      Fulfil export
    </Button>
  );
}

export function FulfilDeleteButton({ id, subject }: { id: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Trash2 aria-hidden className="size-4" />
        Fulfil delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title="Fulfil deletion request"
        description="This anonymises the subject's personal data across contacts and notes, and adds a hashed suppression so they are never sourced again. It cannot be undone."
        body={<p className="font-mono text-sm text-muted">{subject}</p>}
        confirmLabel="Anonymise and suppress"
        confirmPhrase="DELETE"
        onConfirm={async () => {
          const result = await fulfilDeleteAction(id);
          if (result.ok) {
            toast.success(`Anonymised ${String(result.data.anonymisedContacts)} contact(s).`);
            router.refresh();
          }
          return result;
        }}
      />
    </>
  );
}
