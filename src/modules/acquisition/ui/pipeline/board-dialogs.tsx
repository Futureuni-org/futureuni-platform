"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";

import { Field } from "@/components/admin";
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
import type { ActionResult } from "@/lib/result";

import { ButtonLink } from "../leads/button-link";
import { SCROLLING_DIALOG } from "../leads/dialog-scroll";
import { isoToLocalInput, localInputToIso } from "../leads/format";
import { failureOf, UNREACHABLE } from "./action-failure";
import { boardBookingLinkAction } from "./actions";
import type { BoardCardView } from "./board-types";

/**
 * The dialogs a board drop can need (module spec US-32). Each collects what the move requires and
 * only then performs it; closing one without confirming leaves the card where it was. Times are
 * typed and read in the viewer's profile timezone, the one every date on the board is shown in.
 */

interface MoveDialogProps {
  card: BoardCardView | null;
  onOpenChange: (open: boolean) => void;
}

function timezoneNote(timezone: string): string {
  return `Times are in your profile timezone, ${timezone}.`;
}

function ErrorText({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" aria-live="polite" className="text-sm text-danger">
      {message}
    </p>
  );
}

// ---- Meeting booked ---------------------------------------------------------------------------

export interface MeetingMoveInput {
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
}

type ConfirmMeeting = (
  card: BoardCardView,
  input: MeetingMoveInput,
) => Promise<ActionResult<unknown>>;

export function MeetingMoveDialog({
  card,
  timezone,
  onOpenChange,
  onConfirm,
}: MoveDialogProps & { timezone: string; onConfirm: ConfirmMeeting }) {
  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {card !== null && (
          <MeetingBody
            card={card}
            timezone={timezone}
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MeetingBody({
  card,
  timezone,
  onOpenChange,
  onConfirm,
}: {
  card: BoardCardView;
  timezone: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: ConfirmMeeting;
}) {
  const [saving, startSaving] = useTransition();
  const [copying, startCopying] = useTransition();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bookingLink, setBookingLink] = useState<string | null>(null);
  const busy = saving || copying;
  const startIso = localInputToIso(start, timezone);
  const endIso = localInputToIso(end, timezone);
  const valid = startIso !== null && endIso !== null && endIso > startIso;

  function copyBookingLink() {
    setError(null);
    startCopying(async () => {
      let url: string;
      try {
        const result = await boardBookingLinkAction(card.id);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        url = result.data.url;
      } catch (thrown) {
        unstable_rethrow(thrown);
        setError(UNREACHABLE);
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Booking link copied. The lead moves when the prospect books.");
        onOpenChange(false);
      } catch {
        // Some browsers only allow a clipboard write straight from the click, and the link had to
        // be fetched first. Show it so it can be copied by hand.
        setBookingLink(url);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">Book a meeting with {card.companyName}</DialogTitle>
        <DialogDescription>
          Log a meeting you have already arranged, or send the booking link and let the prospect
          choose a time.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts" required>
          {({ id }) => (
            <Input
              id={id}
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Ends"
          required
          error={
            startIso !== null && endIso !== null && !valid ? "It must end after it starts." : null
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="datetime-local"
              aria-describedby={describedBy}
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <p className="text-sm text-muted">{timezoneNote(timezone)}</p>
      <Field label="Location or link">
        {({ id }) => (
          <Input
            id={id}
            value={location}
            maxLength={300}
            onChange={(e) => {
              setLocation(e.target.value);
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
            maxLength={2000}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        )}
      </Field>
      {bookingLink !== null && (
        <Field
          label="Booking link"
          description="Your browser didn't allow the copy. Select the link and copy it, then send it to the prospect."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              readOnly
              value={bookingLink}
              aria-describedby={describedBy}
              onFocus={(e) => {
                e.currentTarget.select();
              }}
              className="font-mono text-sm"
            />
          )}
        </Field>
      )}
      <ErrorText message={error} />
      <DialogFooter>
        <Button variant="ghost" loading={copying} disabled={busy} onClick={copyBookingLink}>
          <Copy aria-hidden className="size-4" />
          Send booking link instead
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          loading={saving}
          disabled={!valid || busy}
          onClick={() => {
            if (startIso === null || endIso === null) return;
            setError(null);
            startSaving(async () => {
              const failure = await failureOf(() =>
                onConfirm(card, {
                  startsAt: startIso,
                  endsAt: endIso,
                  location: location.trim() === "" ? null : location,
                  notes: notes.trim() === "" ? null : notes,
                }),
              );
              if (failure === null) onOpenChange(false);
              else setError(failure);
            });
          }}
        >
          Log meeting
        </Button>
      </DialogFooter>
    </>
  );
}

// ---- A date, with an optional note (nurture, next action) -------------------------------------

type ConfirmUntil = (
  card: BoardCardView,
  untilIso: string,
  note: string | null,
) => Promise<ActionResult<unknown>>;

interface UntilCopy {
  description: string;
  dateLabel: string;
  noteLabel: string;
  confirmLabel: string;
}

export function UntilMoveDialog({
  card,
  timezone,
  onOpenChange,
  title,
  prefill = false,
  onConfirm,
  ...copy
}: MoveDialogProps &
  UntilCopy & {
    timezone: string;
    title: (card: BoardCardView) => string;
    /** Start the form from the card's current next action (the dialog that edits it). */
    prefill?: boolean;
    onConfirm: ConfirmUntil;
  }) {
  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {card !== null && (
          <UntilBody
            card={card}
            timezone={timezone}
            onOpenChange={onOpenChange}
            title={title(card)}
            initialAt={prefill ? card.nextActionAt : null}
            initialNote={prefill ? card.nextActionNote : null}
            onConfirm={onConfirm}
            {...copy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UntilBody({
  card,
  timezone,
  onOpenChange,
  title,
  description,
  dateLabel,
  noteLabel,
  confirmLabel,
  initialAt,
  initialNote,
  onConfirm,
}: UntilCopy & {
  card: BoardCardView;
  timezone: string;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialAt: string | null;
  initialNote: string | null;
  onConfirm: ConfirmUntil;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(
    initialAt === null ? "" : isoToLocalInput(initialAt, timezone),
  );
  const [note, setNote] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const iso = localInputToIso(value, timezone);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field label={dateLabel} required description={timezoneNote(timezone)}>
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
      <Field label={noteLabel}>
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            value={note}
            maxLength={300}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        )}
      </Field>
      <ErrorText message={error} />
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
          loading={pending}
          disabled={iso === null || pending}
          onClick={() => {
            if (iso === null) return;
            setError(null);
            startTransition(async () => {
              const failure = await failureOf(() =>
                onConfirm(card, iso, note.trim() === "" ? null : note),
              );
              if (failure === null) onOpenChange(false);
              else setError(failure);
            });
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

// ---- Proposal sent ----------------------------------------------------------------------------

/**
 * A lead only reaches "Proposal sent" by sending a proposal, so a drop there is refused and this
 * offers the way to do it (AC-32.3).
 */
export function ProposalHintDialog({
  card,
  onOpenChange,
  leadHref,
}: MoveDialogProps & { leadHref: (card: BoardCardView) => string }) {
  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {card !== null && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words">
                Send a proposal to move {card.companyName}
              </DialogTitle>
              <DialogDescription>
                A lead moves to Proposal sent when a proposal is sent to the prospect. It can&apos;t
                be dragged there.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-foreground">
              {card.hasProposal
                ? "This lead already has a proposal. Open it to approve and send it."
                : "This lead has no proposal yet. Build one from the line's packages."}
            </p>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <ButtonLink
                href={`${leadHref(card)}?tab=proposals${card.hasProposal ? "" : "&new=1"}`}
              >
                {card.hasProposal ? "Open proposals" : "Create proposal"}
              </ButtonLink>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
