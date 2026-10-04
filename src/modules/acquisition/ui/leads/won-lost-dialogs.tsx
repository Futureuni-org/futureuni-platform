"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { Currency, LostReason, ServiceLine } from "@/contracts/common";
import { Field, Select } from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { CurrencyInput } from "./currency-input";
import { markLostAction, markWonAction } from "./detail-actions";
import { SCROLLING_DIALOG } from "./dialog-scroll";
import { dateInputToIso, LOST_REASON_LABEL, SERVICE_LINE_LABEL } from "./format";

const LOST_REASONS = Object.keys(LOST_REASON_LABEL) as LostReason[];

/**
 * The Won and Lost dialogs (module spec US-35), shared by the lead-detail header and the pipeline
 * board's drop targets. Cancelling either leaves the lead untouched, which is what lets the board
 * snap a card back when a drop is abandoned.
 */

export interface WonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  companyName: string;
  serviceLine: ServiceLine;
  currencies: readonly Currency[];
  proposals: { id: string; label: string }[];
  onDone: (result: { dealId: string; handoffId: string }) => void;
}

export function WonDialog(props: WonDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {props.open && <WonBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function WonBody({
  onOpenChange,
  leadId,
  companyName,
  serviceLine,
  currencies,
  proposals,
  onDone,
}: WonDialogProps) {
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState<Currency>(currencies[0] ?? "NGN");
  const [valueMinor, setValueMinor] = useState<number | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([serviceLine]);
  const [proposalId, setProposalId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = valueMinor !== null && services.length > 0 && !pending;

  function toggleService(line: ServiceLine) {
    setServices((prev) => (prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]));
  }

  function submit() {
    if (valueMinor === null) return;
    setError(null);
    startTransition(async () => {
      const result = await markWonAction(leadId, {
        valueMinor,
        currency,
        services,
        proposalId: proposalId === "" ? null : proposalId,
        startDate: dateInputToIso(startDate),
        notes: notes.trim() === "" ? null : notes,
      });
      if (result.ok) {
        toast.success(`${companyName} marked won. The handoff is ready.`);
        onOpenChange(false);
        onDone(result.data);
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark {companyName} won</DialogTitle>
        <DialogDescription>
          This closes the lead, stops outreach to the company and creates the handoff record.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Deal value" required>
          {({ id, describedBy }) => (
            <CurrencyInput
              id={id}
              describedBy={describedBy}
              valueMinor={valueMinor}
              currency={currency}
              onChange={setValueMinor}
            />
          )}
        </Field>
        <Field label="Currency">
          {({ id }) => (
            <Select
              id={id}
              value={currency}
              disabled={currencies.length < 2}
              options={currencies.map((c) => ({ value: c, label: c }))}
              onChange={(e) => {
                const next = currencies.find((c) => c === e.target.value);
                if (next !== undefined) setCurrency(next);
              }}
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Services sold</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(Object.keys(SERVICE_LINE_LABEL) as ServiceLine[]).map((line) => (
            <label key={line} className="flex min-h-12 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={services.includes(line)}
                onChange={() => {
                  toggleService(line);
                }}
                className="size-5 accent-[var(--primary)]"
              />
              {SERVICE_LINE_LABEL[line]}
            </label>
          ))}
        </div>
      </fieldset>

      {proposals.length > 0 && (
        <Field label="Linked proposal">
          {({ id }) => (
            <Select
              id={id}
              value={proposalId}
              options={[
                { value: "", label: "No proposal" },
                ...proposals.map((p) => ({ value: p.id, label: p.label })),
              ]}
              onChange={(e) => {
                setProposalId(e.target.value);
              }}
            />
          )}
        </Field>
      )}

      <Field label="Start date">
        {({ id }) => (
          <Input
            id={id}
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Notes">
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        )}
      </Field>

      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button onClick={submit} loading={pending} disabled={!canSubmit}>
          Mark won
        </Button>
      </DialogFooter>
    </>
  );
}

export interface LostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  companyName: string;
  onDone: () => void;
}

export function LostDialog(props: LostDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {props.open && <LostBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function LostBody({ onOpenChange, leadId, companyName, onDone }: LostDialogProps) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<LostReason | "">("");
  const [competitor, setCompetitor] = useState("");
  const [note, setNote] = useState("");
  const [reengage, setReengage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (reason === "") return;
    setError(null);
    startTransition(async () => {
      const result = await markLostAction(leadId, {
        reason,
        competitor: competitor.trim() === "" ? null : competitor,
        note: note.trim() === "" ? null : note,
        reengageAt: dateInputToIso(reengage),
      });
      if (result.ok) {
        toast.success(`${companyName} marked lost.`);
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
        <DialogTitle>Mark {companyName} lost</DialogTitle>
        <DialogDescription>
          This closes the lead and stops outreach to the company. Set a re-engagement date to bring
          it back into nurture later.
        </DialogDescription>
      </DialogHeader>

      <Field label="Reason" required>
        {({ id }) => (
          <Select
            id={id}
            value={reason}
            placeholder="Choose a reason"
            options={LOST_REASONS.map((value) => ({ value, label: LOST_REASON_LABEL[value] }))}
            onChange={(e) => {
              setReason(LOST_REASONS.find((value) => value === e.target.value) ?? "");
            }}
          />
        )}
      </Field>

      <Field label="Competitor">
        {({ id }) => (
          <Input
            id={id}
            value={competitor}
            maxLength={120}
            onChange={(e) => {
              setCompetitor(e.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Note">
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Re-engage on" description="Optional. The lead returns to nurture on this date.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="date"
            aria-describedby={describedBy}
            value={reengage}
            onChange={(e) => {
              setReengage(e.target.value);
            }}
          />
        )}
      </Field>

      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={submit}
          loading={pending}
          disabled={reason === "" || pending}
        >
          Mark lost
        </Button>
      </DialogFooter>
    </>
  );
}
