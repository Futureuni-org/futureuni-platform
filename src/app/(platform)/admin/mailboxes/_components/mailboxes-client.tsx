"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, RefreshCw } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Select } from "@/components/admin";
import { NumberField } from "@/modules/acquisition/ui/settings/editor-fields";
import { RelativeTime } from "@/components/ui/relative-time";
import { addMailboxAction, checkDnsAction, setMailboxStatusAction, updateMailboxCapsAction } from "../actions";
import type { MailboxRow, SendingDomainRow } from "../mailboxes.repo";

const DNS_TONE: Record<string, "success" | "danger" | "neutral"> = {
  PASS: "success",
  FAIL: "danger",
  UNKNOWN: "neutral",
};
const MAILBOX_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  WARMING: "warning",
  PAUSED: "danger",
  DISABLED: "neutral",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => { setCopied(false); }, 1500);
        });
      }}
    >
      {copied ? <Check aria-hidden className="size-3" /> : <Copy aria-hidden className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function DomainCard({ domain, timezone, canCheck }: { domain: SendingDomainRow; timezone: string; canCheck: boolean }) {
  const [records, setRecords] = useState(domain.fixes);
  const [lastChecked, setLastChecked] = useState<string | null>(domain.lastCheckedAt?.toISOString() ?? null);
  const [pending, startTransition] = useTransition();

  function recheck() {
    startTransition(async () => {
      const result = await checkDnsAction(domain.domain);
      if (result.ok) {
        const r = result.data;
        setRecords([
          { record: "SPF", status: r.spf.status, fix: r.spf.fix },
          { record: "DKIM", status: r.dkim.status, fix: r.dkim.fix },
          { record: "DMARC", status: r.dmarc.status, fix: r.dmarc.fix },
          { record: "MX", status: r.mx.status, fix: r.mx.fix },
        ]);
        setLastChecked(new Date().toISOString());
        toast.success(`Re-checked ${domain.domain}.`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zone px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{domain.domain}</span>
        <div className="flex items-center gap-2">
          {lastChecked !== null && (
            <span className="text-xs text-muted">
              checked <RelativeTime value={lastChecked} timezone={timezone} />
            </span>
          )}
          {canCheck && (
            <Button variant="secondary" size="sm" className="gap-1" onClick={recheck} loading={pending}>
              <RefreshCw aria-hidden className="size-4" />
              Re-check
            </Button>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {records.map((rec) => (
          <li key={rec.record} className="flex flex-col gap-1 rounded-md bg-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {rec.record}
                <Badge tone={DNS_TONE[rec.status] ?? "neutral"}>{rec.status}</Badge>
              </span>
              {rec.fix !== null && rec.status !== "PASS" && <CopyButton value={rec.fix} />}
            </div>
            {rec.fix !== null && rec.status !== "PASS" && (
              <code className="break-all font-mono text-xs text-muted">{rec.fix}</code>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MailboxCard({ mailbox, canManage }: { mailbox: MailboxRow; canManage: boolean }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = mailbox.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    startTransition(async () => {
      const result = await setMailboxStatusAction(mailbox.id, next);
      if (result.ok) {
        toast.success(next === "PAUSED" ? "Mailbox paused." : "Mailbox resumed.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zone px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{mailbox.address}</span>
          <Badge tone={MAILBOX_TONE[mailbox.status] ?? "neutral"}>{mailbox.status}</Badge>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {mailbox.status !== "DISABLED" && (
              <Button variant="secondary" size="sm" onClick={toggle} loading={pending}>
                {mailbox.status === "PAUSED" ? "Resume" : "Pause"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setEditOpen(true); }}>Edit caps</Button>
          </div>
        )}
      </div>
      <div className="grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
        <span>{mailbox.domain} · {mailbox.provider}</span>
        <span>Warm-up day <span className="font-mono text-foreground">{mailbox.warmupDay}</span> · cap {mailbox.todaysCap}/{mailbox.dailyCapTarget}</span>
        <span>Sent today <span className="font-mono text-foreground">{mailbox.sentToday}</span>/{mailbox.todaysCap}</span>
        <span>Bounces {mailbox.hardBouncesToday} · replies {mailbox.repliesToday}</span>
        <span>Window {mailbox.sendWindowStart}–{mailbox.sendWindowEnd}</span>
      </div>
      {mailbox.status === "PAUSED" && mailbox.pausedReason !== null && (
        <p className="text-sm text-danger">Paused: {mailbox.pausedReason}</p>
      )}
      {canManage && <EditCapsDialog mailbox={mailbox} open={editOpen} onOpenChange={setEditOpen} />}
    </div>
  );
}

function EditCapsDialog({ mailbox, open, onOpenChange }: { mailbox: MailboxRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [dailyCapTarget, setDailyCapTarget] = useState(mailbox.dailyCapTarget);
  const [warmupRampDays, setWarmupRampDays] = useState(mailbox.warmupRampDays);
  const [start, setStart] = useState(mailbox.sendWindowStart);
  const [end, setEnd] = useState(mailbox.sendWindowEnd);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateMailboxCapsAction(mailbox.id, {
        dailyCapTarget,
        warmupRampDays,
        sendWindowStart: start,
        sendWindowEnd: end,
      });
      if (result.ok) { toast.success("Mailbox updated."); onOpenChange(false); router.refresh(); }
      else setError(result.error.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {mailbox.address}</DialogTitle>
          <DialogDescription>Daily cap, warm-up ramp and send window.</DialogDescription>
        </DialogHeader>
        <NumberField label="Daily cap target" value={dailyCapTarget} min={1} max={2000} onChange={(v) => { setDailyCapTarget(v ?? 1); }} />
        <NumberField label="Warm-up ramp (days)" value={warmupRampDays} min={0} max={90} onChange={(v) => { setWarmupRampDays(v ?? 0); }} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Window start">
            {({ id }) => <Input id={id} value={start} onChange={(e) => { setStart(e.target.value); }} placeholder="09:00" />}
          </Field>
          <Field label="Window end">
            {({ id }) => <Input id={id} value={end} onChange={(e) => { setEnd(e.target.value); }} placeholder="17:00" />}
          </Field>
        </div>
        {error != null && <p role="alert" aria-live="polite" className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); }} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddMailboxDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sendingDomain, setSendingDomain] = useState("");
  const [provider, setProvider] = useState("mock");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addMailboxAction({ address, displayName, sendingDomain, provider: provider as "gmail-api" | "smtp" | "mock" });
      if (result.ok) {
        toast.success("Mailbox added (warming).");
        setAddress(""); setDisplayName(""); setSendingDomain("");
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
        <Button size="sm" className="gap-2"><Plus aria-hidden className="size-4" />Add mailbox</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a mailbox</DialogTitle>
          <DialogDescription>Starts in warm-up. Connect its credential in Integrations.</DialogDescription>
        </DialogHeader>
        <Field label="Address">
          {({ id }) => <Input id={id} type="email" value={address} onChange={(e) => { setAddress(e.target.value); }} placeholder="outreach@send.example.com" />}
        </Field>
        <Field label="Display name">
          {({ id }) => <Input id={id} value={displayName} onChange={(e) => { setDisplayName(e.target.value); }} />}
        </Field>
        <Field label="Sending domain">
          {({ id }) => <Input id={id} value={sendingDomain} onChange={(e) => { setSendingDomain(e.target.value); }} placeholder="send.example.com" />}
        </Field>
        <Field label="Provider">
          {({ id }) => (
            <Select
              id={id}
              value={provider}
              options={[{ value: "mock", label: "Mock" }, { value: "gmail-api", label: "Gmail API" }, { value: "smtp", label: "SMTP" }]}
              onChange={(e) => { setProvider(e.target.value); }}
            />
          )}
        </Field>
        {error != null && <p role="alert" aria-live="polite" className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => { setOpen(false); }} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={address.trim() === "" || sendingDomain.trim() === ""}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
