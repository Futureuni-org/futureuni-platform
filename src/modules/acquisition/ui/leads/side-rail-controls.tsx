"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Pencil } from "lucide-react";

import { Select, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/cn";

import { assignOwnerAction, setNextActionAction, setPrimaryContactAction } from "./detail-actions";
import { isoToLocalInput, localInputToIso } from "./format";
import { OwnerAvatar } from "./owner-avatar";

/** Interactive pieces of the lead-detail side rail. Each calls a server action, then refreshes. */

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }
  return { pending, run };
}

export function OwnerControl({
  leadId,
  owner,
  owners,
  canAssign,
}: {
  leadId: string;
  owner: { id: string; name: string | null; image: string | null } | null;
  owners: SelectOption[];
  canAssign: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {owner === null ? (
          <span className="text-sm text-muted">Unassigned</span>
        ) : (
          <>
            <OwnerAvatar name={owner.name ?? "?"} src={owner.image} />
            <span className="min-w-0 text-sm break-words text-foreground">
              {owner.name ?? "Unknown"}
            </span>
          </>
        )}
      </div>
      {canAssign && owners.length > 0 && (
        <Select
          aria-label="Reassign owner"
          value={owner?.id ?? ""}
          disabled={pending}
          placeholder="Assign an owner"
          options={owners}
          onChange={(e) => {
            const ownerId = e.target.value;
            if (ownerId !== "" && ownerId !== owner?.id) {
              run(() => assignOwnerAction(leadId, ownerId), "Owner updated.");
            }
          }}
        />
      )}
    </div>
  );
}

export function NextActionControl({
  leadId,
  at,
  note,
  overdue,
  timezone,
  canEdit,
}: {
  leadId: string;
  at: string | null;
  note: string | null;
  overdue: boolean;
  timezone: string;
  canEdit: boolean;
}) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState("");
  const [text, setText] = useState("");

  /** Opens the form on what is saved now, so "Edit" edits the current action instead of a blank. */
  function startEditing() {
    setWhen(at === null ? "" : isoToLocalInput(at, timezone));
    setText(note ?? "");
    setEditing(true);
  }

  if (editing) {
    const iso = localInputToIso(when, timezone);
    return (
      <div className="flex flex-col gap-2">
        <Input
          type="datetime-local"
          aria-label="Next action date"
          value={when}
          onChange={(e) => {
            setWhen(e.target.value);
          }}
        />
        <Input
          aria-label="Next action note"
          placeholder="What needs to happen?"
          value={text}
          maxLength={300}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            loading={pending}
            disabled={iso === null}
            onClick={() => {
              run(
                () => setNextActionAction(leadId, iso, text.trim() === "" ? null : text),
                "Next action saved.",
                () => {
                  setEditing(false);
                },
              );
            }}
          >
            Save
          </Button>
          {at !== null && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                run(
                  () => setNextActionAction(leadId, null, null),
                  "Next action cleared.",
                  () => {
                    setEditing(false);
                  },
                );
              }}
            >
              Clear
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 text-sm">
        {at === null ? (
          <span className="text-muted">Nothing scheduled</span>
        ) : (
          <span className={cn("inline-flex items-center gap-1", overdue && "text-danger")}>
            {overdue && <AlertTriangle aria-hidden className="size-3.5" />}
            <RelativeTime
              value={at}
              timezone={timezone}
              {...(overdue ? { className: "text-danger" } : {})}
            />
            {overdue && <span className="font-medium">· overdue</span>}
          </span>
        )}
        {note !== null && <p className="mt-0.5 break-words text-foreground">{note}</p>}
      </div>
      {canEdit && (
        <Button variant="ghost" onClick={startEditing}>
          <Pencil aria-hidden className="size-3.5" />
          {at === null ? "Set" : "Edit"}
        </Button>
      )}
    </div>
  );
}

export function SetPrimaryButton({
  leadId,
  contactId,
  contactName,
}: {
  leadId: string;
  contactId: string;
  contactName: string;
}) {
  const { pending, run } = useAction();
  return (
    <Button
      variant="ghost"
      loading={pending}
      aria-label={`Set ${contactName} as the primary contact`}
      onClick={() => {
        run(() => setPrimaryContactAction(leadId, contactId), "Primary contact updated.");
      }}
    >
      Set as primary
    </Button>
  );
}
