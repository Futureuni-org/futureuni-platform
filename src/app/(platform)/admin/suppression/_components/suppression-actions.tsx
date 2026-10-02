"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
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
import {
  addSuppressionAction,
  importSuppressionsAction,
  removeSuppressionAction,
} from "../actions";

const TYPE_OPTIONS = [
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "DOMAIN", label: "Domain" },
];
const REASON_OPTIONS = [
  { value: "MANUAL", label: "Manual" },
  { value: "OBJECTION", label: "Objection" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "UNSUBSCRIBE", label: "Unsubscribe" },
];

type AddType = "EMAIL" | "PHONE" | "DOMAIN";
type AddReason = "MANUAL" | "OBJECTION" | "COMPLAINT" | "UNSUBSCRIBE";

export function SuppressionToolbar({ canImport }: { canImport: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <AddSuppressionDialog />
      {canImport && <ImportSuppressionsDialog />}
    </div>
  );
}

function AddSuppressionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AddType>("EMAIL");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<AddReason>("MANUAL");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addSuppressionAction({
        type,
        value,
        reason,
        ...(note.trim() === "" ? {} : { note: note.trim() }),
      });
      if (result.ok) {
        toast.success(
          result.data.suppressedLeads > 0
            ? `Suppressed. ${String(result.data.suppressedLeads)} lead(s) and ${String(result.data.stoppedEnrollments)} enrolment(s) stopped.`
            : "Suppression added.",
        );
        setValue("");
        setNote("");
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
          Add suppression
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a suppression</DialogTitle>
          <DialogDescription>
            A suppressed contact can never be messaged. Adding one stops any active outreach at its
            company.
          </DialogDescription>
        </DialogHeader>
        <Field label="Type">
          {({ id }) => (
            <Select
              id={id}
              options={TYPE_OPTIONS}
              value={type}
              onChange={(e) => {
                setType(e.target.value as AddType);
              }}
            />
          )}
        </Field>
        <Field label="Value" description="An email address, phone number (E.164) or domain.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
              placeholder={
                type === "DOMAIN" ? "example.com" : type === "PHONE" ? "+234…" : "name@example.com"
              }
            />
          )}
        </Field>
        <Field label="Reason">
          {({ id }) => (
            <Select
              id={id}
              options={REASON_OPTIONS}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value as AddReason);
              }}
            />
          )}
        </Field>
        <Field label="Note" description="Optional context, shown in the audit trail.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
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
          <Button onClick={submit} loading={pending} disabled={value.trim() === ""}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSuppressionsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importSuppressionsAction(csv);
      if (res.ok) {
        setResult(res.data);
        toast.success(`Imported ${String(res.data.added)}, skipped ${String(res.data.skipped)}.`);
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  }

  async function onFile(file: File | undefined) {
    if (file === undefined) return;
    setCsv(await file.text());
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2">
          <Upload aria-hidden className="size-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import suppressions</DialogTitle>
          <DialogDescription>
            CSV columns: <span className="font-mono">type,value,reason,source[,note]</span>. Each row
            is added and cascaded like a manual suppression.
          </DialogDescription>
        </DialogHeader>
        <Field label="CSV file">
          {({ id }) => (
            <input
              id={id}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
              }}
              className="text-sm text-muted file:mr-3 file:rounded-md file:border file:border-input file:bg-surface file:px-3 file:py-2 file:text-sm"
            />
          )}
        </Field>
        <Field label="Or paste CSV">
          {({ id }) => (
            <Textarea
              id={id}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
              }}
              rows={5}
              className="font-mono text-xs"
            />
          )}
        </Field>
        {result != null && (
          <div aria-live="polite" className="text-sm text-foreground">
            <p>
              Added {result.added}, skipped {result.skipped}.
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-danger">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
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
              setOpen(false);
            }}
            disabled={pending}
          >
            Close
          </Button>
          <Button onClick={submit} loading={pending} disabled={csv.trim() === ""}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveSuppressionButton({ id, value }: { id: string; value: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title="Remove suppression"
        description="Removing a suppression allows this contact to be messaged again. This is audited and a reason is required."
        body={<p className="font-mono text-sm text-muted">{value}</p>}
        confirmLabel="Remove"
        requireReason
        reasonPlaceholder="Why is this being removed?"
        onConfirm={async (reason) => {
          const result = await removeSuppressionAction(id, reason);
          if (result.ok) {
            toast.success("Suppression removed.");
            router.refresh();
          }
          return result;
        }}
      />
    </>
  );
}
