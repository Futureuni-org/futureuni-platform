"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlarmClock, MailOpen, MessageSquarePlus, PanelRight } from "lucide-react";

import { Field, Select, type SelectOption } from "@/components/admin";
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/result";

import { SCROLLING_DIALOG } from "../leads/dialog-scroll";
import { localInputToIso } from "../leads/format";
import { withPerson } from "../leads/select-options";
import { useUrlParams } from "../leads/use-url-params";
import {
  assignThreadAction,
  logAssistedReplyAction,
  markThreadUnreadAction,
  snoozeThreadAction,
} from "./actions";
import { ContextRail } from "./context-rail";
import type { InboxCapabilities, ThreadContextView } from "./inbox-types";

type AssistedChannel = "WHATSAPP" | "LINKEDIN" | "PHONE";

const ASSISTED_CHANNELS: { value: AssistedChannel; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "PHONE", label: "Phone call" },
];

/**
 * Actions on the open thread: assign, snooze, mark unread, and log a reply that came in on
 * WhatsApp, LinkedIn or the phone (it is classified and actioned exactly like an email reply). On
 * screens too narrow for the third pane, "Details" opens the context rail in a sheet.
 */
export function ThreadToolbar({
  context,
  owners,
  capabilities,
  timezone,
}: {
  context: ThreadContextView;
  owners: SelectOption[];
  capabilities: InboxCapabilities;
  timezone: string;
}) {
  const router = useRouter();
  const setParams = useUrlParams();
  const [pending, startTransition] = useTransition();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // The current owner is always listed, even if they have since left this line's team: a select
  // whose value matches no option would show someone else's name.
  const ownerOptions = withPerson(
    owners,
    context.ownerId === null ? null : { id: context.ownerId, name: context.ownerName },
  );

  function run(action: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        if (after === undefined) router.refresh();
        else after();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {capabilities.assign && ownerOptions.length > 0 && (
        <label className="flex min-w-[11rem] flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Assigned to</span>
          <Select
            aria-label="Assigned to"
            value={context.ownerId ?? ""}
            disabled={pending}
            placeholder="Unassigned"
            options={ownerOptions}
            onChange={(e) => {
              const userId = e.target.value;
              if (userId !== "" && userId !== context.ownerId) {
                run(() => assignThreadAction(context.leadId, userId), "Thread assigned.");
              }
            }}
          />
        </label>
      )}

      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setSnoozeOpen(true);
        }}
      >
        <AlarmClock aria-hidden className="size-4" />
        Snooze
      </Button>

      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          // Closing the thread keeps it unread; leaving it open would mark it read again.
          run(
            () => markThreadUnreadAction(context.leadId),
            "Marked unread.",
            () => {
              setParams({ thread: null });
            },
          );
        }}
      >
        <MailOpen aria-hidden className="size-4" />
        Mark unread
      </Button>

      {capabilities.logAssisted && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setLogOpen(true);
          }}
        >
          <MessageSquarePlus aria-hidden className="size-4" />
          Log a reply
        </Button>
      )}

      <Button
        variant="ghost"
        className="2xl:hidden"
        onClick={() => {
          setDetailsOpen(true);
        }}
      >
        <PanelRight aria-hidden className="size-4" />
        Details
      </Button>

      {/* Each dialog's form lives in a body that mounts when it opens, so it always starts empty. */}
      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent className={SCROLLING_DIALOG}>
          {snoozeOpen && (
            <SnoozeBody
              timezone={timezone}
              pending={pending}
              onCancel={() => {
                setSnoozeOpen(false);
              }}
              onConfirm={(until) => {
                run(
                  () => snoozeThreadAction(context.leadId, until),
                  "Thread snoozed.",
                  () => {
                    setSnoozeOpen(false);
                    router.refresh();
                  },
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className={SCROLLING_DIALOG}>
          {logOpen && (
            <LogReplyBody
              pending={pending}
              onCancel={() => {
                setLogOpen(false);
              }}
              onConfirm={(channel, text) => {
                run(
                  () => logAssistedReplyAction({ leadId: context.leadId, channel, text }),
                  "Reply logged. It has been classified and actioned.",
                  () => {
                    setLogOpen(false);
                    router.refresh();
                  },
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetTitle className="sr-only">Thread details</SheetTitle>
          <SheetDescription className="sr-only">
            The lead behind this thread and whether it can be contacted.
          </SheetDescription>
          <ContextRail context={context} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SnoozeBody({
  timezone,
  pending,
  onCancel,
  onConfirm,
}: {
  timezone: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (untilIso: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The time typed is a wall-clock time in the viewer's profile timezone, like every time shown.
  const iso = localInputToIso(value, timezone);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Snooze this thread</DialogTitle>
        <DialogDescription>
          It leaves the inbox until then, or until the prospect replies again.
        </DialogDescription>
      </DialogHeader>
      <Field
        label="Until"
        required
        description={`In your profile's timezone (${timezone}).`}
        error={error}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="datetime-local"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        )}
      </Field>
      <DialogFooter>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          loading={pending}
          disabled={iso === null}
          onClick={() => {
            if (iso === null) return;
            if (new Date(iso).getTime() <= Date.now()) {
              setError("Choose a time in the future.");
              return;
            }
            onConfirm(iso);
          }}
        >
          Snooze
        </Button>
      </DialogFooter>
    </>
  );
}

function LogReplyBody({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (channel: AssistedChannel, text: string) => void;
}) {
  const [channel, setChannel] = useState<AssistedChannel>("WHATSAPP");
  const [text, setText] = useState("");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Log a reply from another channel</DialogTitle>
        <DialogDescription>
          Paste what the prospect said. It is classified and acted on like an email reply, which can
          stop outreach, suppress the contact or change the lead&apos;s status.
        </DialogDescription>
      </DialogHeader>
      <Field label="Channel" required>
        {({ id }) => (
          <Select
            id={id}
            value={channel}
            options={ASSISTED_CHANNELS}
            onChange={(e) => {
              const next = ASSISTED_CHANNELS.find((option) => option.value === e.target.value);
              if (next !== undefined) setChannel(next.value);
            }}
          />
        )}
      </Field>
      <Field label="What they said" required>
        {({ id }) => (
          <Textarea
            id={id}
            rows={6}
            value={text}
            maxLength={12000}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        )}
      </Field>
      <DialogFooter>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          loading={pending}
          disabled={text.trim() === ""}
          onClick={() => {
            onConfirm(channel, text);
          }}
        >
          Log reply
        </Button>
      </DialogFooter>
    </>
  );
}
