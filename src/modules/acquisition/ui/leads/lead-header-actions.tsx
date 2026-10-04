"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, MoreHorizontal } from "lucide-react";

import type { Currency, LeadStatus, ServiceLine } from "@/contracts/common";
import { ConfirmDialog, Field } from "@/components/admin";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/result";

import { bulkSuppressAction } from "./actions";
import { ButtonLink } from "./button-link";
import {
  disqualifyAction,
  nurtureAction,
  reauditAction,
  reengageAction,
  rescoreAction,
  snoozeAction,
} from "./detail-actions";
import type { DetailCapabilities } from "./detail-types";
import { SCROLLING_DIALOG } from "./dialog-scroll";
import { localInputToIso } from "./format";
import {
  PRIMARY_LABEL,
  SECONDARY_LABEL,
  primaryActions,
  secondaryActions,
  type PrimaryActionId,
  type SecondaryActionId,
} from "./lead-actions";
import { LostDialog, WonDialog } from "./won-lost-dialogs";

type OpenDialog =
  "won" | "lost" | "reengage" | "snooze" | "nurture" | "disqualify" | "suppress" | null;

export function LeadHeaderActions({
  leadId,
  companyName,
  status,
  serviceLine,
  capabilities,
  detailPath,
  reviewHref,
  bookingLink,
  currencies,
  proposals,
  timezone,
}: {
  leadId: string;
  companyName: string;
  status: LeadStatus;
  serviceLine: ServiceLine;
  capabilities: DetailCapabilities;
  detailPath: string;
  reviewHref: string;
  bookingLink: string | null;
  currencies: readonly Currency[];
  proposals: { id: string; label: string }[];
  /** The viewer's profile timezone: a date typed into a dialog is read in it. */
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<OpenDialog>(null);

  const primary = primaryActions(status, capabilities);
  const secondary = secondaryActions(status, capabilities);

  function close(next: boolean) {
    if (!next) setOpen(null);
  }

  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  async function confirm(
    action: () => Promise<ActionResult<unknown>>,
    success: string,
  ): Promise<ActionResult<unknown>> {
    const result = await action();
    if (result.ok) {
      toast.success(success);
      router.refresh();
    }
    return result;
  }

  function copyBookingLink() {
    if (bookingLink === null) return;
    // The clipboard is missing on an insecure origin and can be refused by the browser. Either
    // way the link is shown, so it can still be copied by hand.
    const showLink = () =>
      toast.message("Copy the booking link", { description: bookingLink, duration: 20_000 });
    if (!("clipboard" in navigator)) {
      showLink();
      return;
    }
    void navigator.clipboard
      .writeText(bookingLink)
      .then(() => toast.success("Booking link copied."), showLink);
  }

  function renderPrimary(action: PrimaryActionId, index: number) {
    const variant = index === 0 ? "primary" : "secondary";
    const label = PRIMARY_LABEL[action];
    switch (action) {
      case "draftOutreach":
      case "openReview":
        return (
          <ButtonLink key={action} href={reviewHref} variant={variant}>
            {label}
          </ButtonLink>
        );
      case "bookMeeting":
        return (
          <DropdownMenu key={action}>
            <DropdownMenuTrigger asChild>
              <Button variant={variant}>
                {label}
                <ChevronDown aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {bookingLink !== null && (
                <DropdownMenuItem onSelect={copyBookingLink}>Copy booking link</DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  router.push(`${detailPath}?tab=meetings&new=1`);
                }}
              >
                Log a manual meeting
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      case "createProposal":
        return (
          <ButtonLink key={action} href={`${detailPath}?tab=proposals&new=1`} variant={variant}>
            {label}
          </ButtonLink>
        );
      case "markWon":
        return (
          <Button
            key={action}
            variant={variant}
            onClick={() => {
              setOpen("won");
            }}
          >
            {label}
          </Button>
        );
      case "markLost":
        return (
          <Button
            key={action}
            variant={variant}
            onClick={() => {
              setOpen("lost");
            }}
          >
            {label}
          </Button>
        );
      case "reengage":
        return (
          <Button
            key={action}
            variant={variant}
            onClick={() => {
              setOpen("reengage");
            }}
          >
            {label}
          </Button>
        );
    }
  }

  function selectSecondary(action: SecondaryActionId) {
    switch (action) {
      case "rescore":
        run(() => rescoreAction(leadId), "Lead re-scored.");
        return;
      case "reaudit":
        run(() => reauditAction(leadId), "Audits re-run. The evidence is up to date.");
        return;
      case "snooze":
      case "nurture":
      case "disqualify":
      case "suppress":
        setOpen(action);
        return;
      case "dataRequest":
        return;
    }
  }

  return (
    <>
      {primary.map(renderPrimary)}

      {secondary.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" disabled={pending} aria-label="More actions">
              <MoreHorizontal aria-hidden className="size-4" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {secondary.map((action) =>
              action === "dataRequest" ? (
                <DropdownMenuItem key={action} asChild>
                  <Link href="/admin/data-requests">{SECONDARY_LABEL[action]}</Link>
                </DropdownMenuItem>
              ) : (
                <Fragment key={action}>
                  {action === "disqualify" && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onSelect={() => {
                      selectSecondary(action);
                    }}
                  >
                    {SECONDARY_LABEL[action]}
                  </DropdownMenuItem>
                </Fragment>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <WonDialog
        open={open === "won"}
        onOpenChange={close}
        leadId={leadId}
        companyName={companyName}
        serviceLine={serviceLine}
        currencies={currencies}
        proposals={proposals}
        onDone={() => {
          router.refresh();
        }}
      />
      <LostDialog
        open={open === "lost"}
        onOpenChange={close}
        leadId={leadId}
        companyName={companyName}
        onDone={() => {
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={open === "reengage"}
        onOpenChange={close}
        title={`Re-engage ${companyName}?`}
        description="The lead moves from nurture back into the conversation stage."
        confirmLabel="Re-engage"
        onConfirm={() => confirm(() => reengageAction(leadId), "Lead re-engaged.")}
      />

      <ConfirmDialog
        open={open === "disqualify"}
        onOpenChange={close}
        title={`Disqualify ${companyName}?`}
        description="Give a reason. A disqualified lead leaves the active pipeline."
        confirmLabel="Disqualify"
        tone="danger"
        requireReason
        reasonPlaceholder="Why isn't this lead a fit?"
        onConfirm={(reason) =>
          confirm(() => disqualifyAction(leadId, reason), "Lead disqualified.")
        }
      />

      <ConfirmDialog
        open={open === "suppress"}
        onOpenChange={close}
        title={`Add ${companyName} to suppression?`}
        description="The contact can never be messaged again until an admin removes the entry. All outreach to the company stops."
        confirmLabel="Suppress"
        tone="danger"
        requireReason
        reasonPlaceholder="Why are you suppressing this contact?"
        onConfirm={(reason) =>
          confirm(async () => {
            const result = await bulkSuppressAction([leadId], reason);
            if (result.ok && result.data.failed[0] !== undefined) {
              return {
                ok: false,
                error: { code: "CONFLICT", message: result.data.failed[0].message },
              } as const;
            }
            return result;
          }, "Added to suppression.")
        }
      />

      <UntilDialog
        open={open === "snooze"}
        onOpenChange={close}
        title="Snooze this lead"
        description="The lead is hidden from the review queue until this time. Its status doesn't change."
        confirmLabel="Snooze"
        pending={pending}
        timezone={timezone}
        onConfirm={(until) => {
          run(() => snoozeAction(leadId, until), "Lead snoozed.");
          setOpen(null);
        }}
      />
      <UntilDialog
        open={open === "nurture"}
        onOpenChange={close}
        title="Move to nurture"
        description="Scheduled messages are cancelled and outreach stops. The follow-up date becomes the next action."
        confirmLabel="Move to nurture"
        withNote
        pending={pending}
        timezone={timezone}
        onConfirm={(until, note) => {
          run(() => nurtureAction(leadId, until, note), "Lead moved to nurture.");
          setOpen(null);
        }}
      />
    </>
  );
}

function UntilDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  withNote = false,
  pending,
  timezone,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  withNote?: boolean;
  pending: boolean;
  timezone: string;
  onConfirm: (untilIso: string, note: string | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {open && (
          <UntilBody
            onOpenChange={onOpenChange}
            title={title}
            description={description}
            confirmLabel={confirmLabel}
            withNote={withNote}
            pending={pending}
            timezone={timezone}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UntilBody({
  onOpenChange,
  title,
  description,
  confirmLabel,
  withNote,
  pending,
  timezone,
  onConfirm,
}: {
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  withNote: boolean;
  pending: boolean;
  timezone: string;
  onConfirm: (untilIso: string, note: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const iso = localInputToIso(value, timezone);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field label="Until" required description={`A date and time in your timezone (${timezone}).`}>
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
      {withNote && (
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
          disabled={iso === null || pending}
          onClick={() => {
            if (iso !== null) onConfirm(iso, note.trim() === "" ? null : note);
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
