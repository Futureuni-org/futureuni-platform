"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Select } from "@/components/admin";
import { CheckboxField } from "@/modules/acquisition/ui/settings/editor-fields";
import { activatePromptAction, diffPromptsAction, publishPromptAction } from "../actions";

export interface TaskVersion {
  version: number;
  isActive: boolean;
  evalScore: number | null;
  publishedAt: string;
  changelog: string;
}

export function TaskPanel({
  task,
  description,
  versions,
  timezone,
  canPublish,
  canActivate,
  isAdmin,
}: {
  task: string;
  description: string;
  versions: TaskVersion[];
  timezone: string;
  canPublish: boolean;
  canActivate: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const active = versions.find((v) => v.isActive);
  const [publishOpen, setPublishOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function activate(version: number) {
    startTransition(async () => {
      const result = await activatePromptAction(task, version);
      if (result.ok) { toast.success(`Activated v${String(version)}.`); router.refresh(); }
      else toast.error(result.error.message);
    });
  }

  return (
    <details className="rounded-lg bg-zone px-4 py-3">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className="font-mono text-sm text-foreground">{task}</span>
          <span className="text-xs text-muted">{description}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          {active !== undefined ? (
            <Badge tone="success">v{active.version} active</Badge>
          ) : (
            <Badge tone="neutral">none active</Badge>
          )}
          {active?.evalScore != null && (
            <span className="font-mono text-xs text-muted">eval {active.evalScore.toFixed(2)}</span>
          )}
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {canPublish && (
            <Button size="sm" onClick={() => { setPublishOpen(true); }}>Publish from files</Button>
          )}
          {versions.length >= 2 && (
            <Button variant="secondary" size="sm" onClick={() => { setCompareOpen(true); }}>Compare</Button>
          )}
        </div>

        <ul className="flex flex-col divide-y divide-border">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-mono">v{v.version}</span>
                {v.isActive && <Badge tone="success">active</Badge>}
                {v.evalScore != null && <span className="text-xs text-muted">eval {v.evalScore.toFixed(2)}</span>}
                <span className="text-xs text-muted">{v.changelog}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted"><RelativeTime value={v.publishedAt} timezone={timezone} /></span>
                {canActivate && !v.isActive && (
                  <Button variant="ghost" size="sm" onClick={() => { activate(v.version); }} disabled={pending}>
                    Activate
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <PublishDialog task={task} isAdmin={isAdmin} open={publishOpen} onOpenChange={setPublishOpen} />
      <CompareDialog task={task} versions={versions} open={compareOpen} onOpenChange={setCompareOpen} />
    </details>
  );
}

function PublishDialog({ task, isAdmin, open, onOpenChange }: { task: string; isAdmin: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await publishPromptAction(task, note, force, forceReason);
      if (result.ok) {
        toast.success(`Published v${String(result.data.version)} (eval ${result.data.evalScore.toFixed(2)}).`);
        setNote(""); setForce(false); setForceReason("");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish {task}</DialogTitle>
          <DialogDescription>Publishes from the current prompt files and runs the eval suite (mock). Blocked if the eval score regresses.</DialogDescription>
        </DialogHeader>
        <Field label="Changelog note">
          {({ id }) => <Textarea id={id} value={note} rows={2} onChange={(e) => { setNote(e.target.value); }} />}
        </Field>
        {isAdmin && (
          <>
            <CheckboxField label="Force publish despite a regression" checked={force} onChange={setForce} />
            {force && (
              <Field label="Reason for forcing">
                {({ id }) => <Textarea id={id} value={forceReason} rows={2} onChange={(e) => { setForceReason(e.target.value); }} />}
              </Field>
            )}
          </>
        )}
        {error != null && <p role="alert" aria-live="polite" className="text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); }} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={note.trim() === "" || (force && forceReason.trim() === "")}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompareDialog({ task, versions, open, onOpenChange }: { task: string; versions: TaskVersion[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [a, setA] = useState(versions[1]?.version ?? versions[0]?.version ?? 1);
  const [b, setB] = useState(versions[0]?.version ?? 1);
  const [result, setResult] = useState<{ a: string; b: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function compare() {
    setError(null);
    startTransition(async () => {
      const res = await diffPromptsAction(task, a, b);
      if (res.ok) setResult(res.data);
      else setError(res.error.message);
    });
  }
  const options = versions.map((v) => ({ value: String(v.version), label: `v${String(v.version)}` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Compare prompt versions</DialogTitle>
          <DialogDescription>The compiled prompt text of two versions.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            {({ id }) => <Select id={id} value={String(a)} options={options} onChange={(e) => { setA(Number(e.target.value)); }} />}
          </Field>
          <Field label="To">
            {({ id }) => <Select id={id} value={String(b)} options={options} onChange={(e) => { setB(Number(e.target.value)); }} />}
          </Field>
          <Button onClick={compare} loading={pending}>Compare</Button>
        </div>
        {error != null && <p role="alert" className="text-sm text-danger">{error}</p>}
        {result !== null && (
          <div className="grid gap-3 sm:grid-cols-2">
            <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-muted">{result.a}</pre>
            <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-foreground">{result.b}</pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
