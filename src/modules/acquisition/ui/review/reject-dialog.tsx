"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, Textarea } from "@/components/ui";
import { Select } from "@/components/admin";

import { REJECT_REASONS, type RejectReason } from "./view";

/** Reject a draft with a fixed reason, an optional note, and the option to disqualify the lead. */
export function RejectDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: (input: { reason: RejectReason; note: string; disqualify: boolean }) => void;
}): React.ReactElement {
  const [reason, setReason] = useState<RejectReason>("TONE");
  const [note, setNote] = useState("");
  const [disqualify, setDisqualify] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this draft</DialogTitle>
          <DialogDescription>
            Rejecting regenerates the draft, or disqualifies the lead if you choose to.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Reason</span>
            <Select
              options={REJECT_REASONS.map((r) => ({ value: r.value, label: r.label }))}
              value={reason}
              onChange={(e) => { setReason(e.target.value as RejectReason); }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Note (optional)</span>
            <Textarea value={note} onChange={(e) => { setNote(e.target.value); }} rows={3} placeholder="What was wrong?" />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={disqualify}
              onChange={(e) => { setDisqualify(e.target.checked); }}
              style={{ accentColor: "var(--primary)" }}
              className="size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            Also disqualify this lead
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); }}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => { onConfirm({ reason, note, disqualify }); }}
            disabled={busy}
          >
            {busy ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
