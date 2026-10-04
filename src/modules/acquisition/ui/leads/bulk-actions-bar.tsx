"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, CalendarClock, RefreshCw, ShieldX, UserPlus } from "lucide-react";

import { ConfirmDialog, Field, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/result";

import {
  bulkAssignAction,
  bulkDisqualifyAction,
  bulkReauditAction,
  bulkRescoreAction,
  bulkSnoozeAction,
  bulkSuppressAction,
  type BulkResult,
} from "./actions";
import { SCROLLING_DIALOG } from "./dialog-scroll";
import { localInputToIso } from "./format";

export interface LeadCapabilities {
  assign: boolean;
  update: boolean;
  rescore: boolean;
  reaudit: boolean;
  disqualify: boolean;
  suppress: boolean;
  exportCsv: boolean;
}

const COUNT = new Intl.NumberFormat("en-GB");

function leads(count: number): string {
  return `${COUNT.format(count)} ${count === 1 ? "lead" : "leads"}`;
}

/**
 * Reports a bulk result in the words of what was done ("Assigned 12 leads", "Re-score queued for 12
 * leads"), and says why when some leads were left out: one reason if they all share it.
 */
function summarise(
  result: ActionResult<BulkResult>,
  done: (count: string) => string,
  onDone: () => void,
): void {
  if (!result.ok) {
    toast.error(result.error.message);
    return;
  }
  const { succeeded, failed } = result.data;
  if (failed.length === 0) {
    toast.success(`${done(leads(succeeded))}.`);
  } else {
    const reasons = new Set(failed.map((failure) => failure.message));
    const [onlyReason] = reasons;
    const why =
      reasons.size === 1 && onlyReason !== undefined ? onlyReason : "The reasons differ by lead.";
    const skipped = `${leads(failed.length)} ${failed.length === 1 ? "was" : "were"} left out. ${why}`;
    if (succeeded === 0) toast.error(skipped);
    else toast.warning(`${done(leads(succeeded))}. ${skipped}`);
  }
  onDone();
}

export function BulkActionsBar({
  selectedIds,
  owners,
  capabilities,
  timezone,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  owners: SelectOption[];
  capabilities: LeadCapabilities;
  /** The viewer's profile timezone: the snooze time is read in it. */
  timezone: string;
  onClear: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [disqualifyOpen, setDisqualifyOpen] = useState(false);
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [rescoreOpen, setRescoreOpen] = useState(false);
  const [reauditOpen, setReauditOpen] = useState(false);
  const count = selectedIds.length;

  function run(action: () => Promise<ActionResult<BulkResult>>, done: (count: string) => string) {
    startTransition(async () => {
      summarise(await action(), done, onDone);
    });
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      // Sits above the shell's bottom navigation on small screens, and near the edge from `md`.
      className="sticky bottom-20 z-10 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-elevated px-4 py-3 shadow-lift md:bottom-4"
    >
      <span className="text-sm font-medium text-foreground" aria-live="polite">
        {COUNT.format(count)} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {capabilities.assign && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" disabled={pending || owners.length === 0}>
                <UserPlus aria-hidden className="size-4" />
                Assign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {owners.map((owner) => (
                <DropdownMenuItem
                  key={owner.value}
                  onSelect={() => {
                    run(
                      () => bulkAssignAction(selectedIds, owner.value),
                      (count) => `Assigned ${count} to ${owner.label}`,
                    );
                  }}
                >
                  {owner.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {capabilities.update && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setSnoozeOpen(true);
            }}
          >
            <CalendarClock aria-hidden className="size-4" />
            Snooze
          </Button>
        )}

        {capabilities.rescore && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setRescoreOpen(true);
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Re-score
          </Button>
        )}

        {capabilities.reaudit && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setReauditOpen(true);
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Re-audit
          </Button>
        )}

        {capabilities.disqualify && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setDisqualifyOpen(true);
            }}
          >
            <Ban aria-hidden className="size-4" />
            Disqualify
          </Button>
        )}

        {capabilities.suppress && (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              setSuppressOpen(true);
            }}
          >
            <ShieldX aria-hidden className="size-4" />
            Suppress
          </Button>
        )}

        <Button variant="ghost" onClick={onClear} disabled={pending}>
          Clear
        </Button>
      </div>

      <SnoozeDialog
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        pending={pending}
        timezone={timezone}
        onConfirm={(until) => {
          run(
            () => bulkSnoozeAction(selectedIds, until),
            (done) => `Snoozed ${done}`,
          );
        }}
      />

      <ConfirmDialog
        open={rescoreOpen}
        onOpenChange={setRescoreOpen}
        title={`Re-score ${leads(count)}?`}
        description="Each lead is queued to be scored again with the current profile. The new score can change its status. Scores update over the next few minutes."
        confirmLabel="Re-score"
        onConfirm={async () => {
          const result = await bulkRescoreAction(selectedIds);
          summarise(result, (done) => `Re-score queued for ${done}`, onDone);
          return result;
        }}
      />

      <ConfirmDialog
        open={reauditOpen}
        onOpenChange={setReauditOpen}
        title={`Re-audit ${leads(count)}?`}
        description="Each lead's audits are queued to run again. This takes a while and may use provider credits. Only enriched and audited leads can be re-audited."
        confirmLabel="Re-audit"
        onConfirm={async () => {
          const result = await bulkReauditAction(selectedIds);
          summarise(result, (done) => `Re-audit queued for ${done}`, onDone);
          return result;
        }}
      />

      <ConfirmDialog
        open={disqualifyOpen}
        onOpenChange={setDisqualifyOpen}
        title={`Disqualify ${leads(count)}?`}
        description="Give a reason. Disqualified leads leave the active pipeline."
        confirmLabel="Disqualify"
        tone="danger"
        requireReason
        reasonLabel="Reason"
        reasonPlaceholder="Why are these leads not a fit?"
        onConfirm={async (reason) => {
          const result = await bulkDisqualifyAction(selectedIds, reason);
          summarise(result, (done) => `Disqualified ${done}`, onDone);
          return result;
        }}
      />

      <ConfirmDialog
        open={suppressOpen}
        onOpenChange={setSuppressOpen}
        title={`Add ${leads(count)} to suppression?`}
        description="Each lead's contact email (or company domain) is suppressed. They can never be messaged again until an admin removes the entry."
        confirmLabel="Suppress"
        tone="danger"
        requireReason
        reasonLabel="Reason"
        reasonPlaceholder="Why are you suppressing these?"
        onConfirm={async (reason) => {
          const result = await bulkSuppressAction(selectedIds, reason);
          summarise(result, (done) => `Suppressed ${done}`, onDone);
          return result;
        }}
      />
    </div>
  );
}

interface SnoozeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  timezone: string;
  onConfirm: (until: string) => void;
}

function SnoozeDialog(props: SnoozeProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {/* Mounted only while open, so the date starts empty each time. */}
        {props.open && <SnoozeBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function SnoozeBody({ onOpenChange, pending, timezone, onConfirm }: SnoozeProps) {
  const [value, setValue] = useState("");
  // Read in the viewer's profile timezone, the one the list's dates are shown in.
  const iso = localInputToIso(value, timezone);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Snooze leads</DialogTitle>
        <DialogDescription>
          The leads are hidden from the review queue until this time. Their status doesn&apos;t
          change.
        </DialogDescription>
      </DialogHeader>
      <Field
        label="Snooze until"
        required
        description={`A date and time in your timezone (${timezone}).`}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="datetime-local"
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
        )}
      </Field>
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
        <Button
          loading={pending}
          disabled={iso === null}
          onClick={() => {
            if (iso === null) return;
            onConfirm(iso);
            onOpenChange(false);
          }}
        >
          Snooze
        </Button>
      </DialogFooter>
    </>
  );
}
