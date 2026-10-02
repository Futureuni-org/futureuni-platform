"use client";

import { useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/result";

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** When set, the user must type this exact phrase to enable the confirm button. */
  confirmPhrase?: string;
  onConfirm: (reason: string) => Promise<ActionResult<unknown>>;
}

/**
 * ConfirmDialog — the platform's AlertDialog. Confirms a consequential action, optionally
 * requiring a typed reason (suppression removal) or a type-to-confirm phrase (DSR delete).
 * `onConfirm` returns an `ActionResult`; on failure the error stays visible and the dialog stays
 * open. The interactive state lives in an inner body that remounts on each open, so nothing stale
 * carries over.
 */
export function ConfirmDialog(props: ConfirmProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <ConfirmBody {...props} />}</DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  onOpenChange,
  title,
  description,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder,
  confirmPhrase,
  onConfirm,
}: ConfirmProps) {
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reasonOk = !requireReason || reason.trim().length > 0;
  const phraseOk = confirmPhrase === undefined || phrase === confirmPhrase;
  const canConfirm = reasonOk && phraseOk && !pending;

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await onConfirm(reason.trim());
    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.error.message);
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description !== undefined && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      {body}

      {requireReason && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{reasonLabel}</span>
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            placeholder={reasonPlaceholder}
            rows={3}
            aria-label={reasonLabel}
          />
        </label>
      )}

      {confirmPhrase !== undefined && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">
            Type <span className="font-mono text-danger">{confirmPhrase}</span> to confirm
          </span>
          <Input
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value);
            }}
            aria-label={`Type ${confirmPhrase} to confirm`}
            autoComplete="off"
          />
        </label>
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
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={() => {
            void handleConfirm();
          }}
          loading={pending}
          disabled={!canConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
