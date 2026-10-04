"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Clock } from "lucide-react";

import type { SlaStatus } from "@/contracts/common";
import { Field, Select, type SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarketBadge } from "@/components/ui/market-badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { useShortcut } from "@/components/patterns/shortcuts";
import { EmptyState } from "@/components/patterns/states";
import { cn } from "@/lib/cn";

import { SCROLLING_DIALOG } from "../leads/dialog-scroll";
import { OwnerAvatar } from "../leads/owner-avatar";
import { withPerson } from "../leads/select-options";
import { ToneBadge, type Tone } from "../leads/tone-badge";
import { assignThreadAction, markThreadUnreadAction } from "./actions";
import { SLA_LABEL, type ThreadRowView } from "./inbox-types";
import { overlayOpen } from "./overlay";

const SLA_META: Partial<Record<SlaStatus, { tone: Tone; icon: typeof Clock }>> = {
  ON_TRACK: { tone: "success", icon: Clock },
  WARNING: { tone: "warning", icon: Clock },
  BREACHED: { tone: "danger", icon: AlertTriangle },
  MET: { tone: "neutral", icon: Check },
};

/** The response timer for a thread: its state as a labelled badge, and when it is due. */
export function SlaIndicator({
  status,
  dueAt,
  timezone,
}: {
  status: SlaStatus;
  dueAt: string | null;
  timezone: string;
}) {
  const meta = SLA_META[status];
  if (meta === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <ToneBadge tone={meta.tone} icon={meta.icon}>
        {SLA_LABEL[status]}
      </ToneBadge>
      {dueAt !== null &&
        (status === "ON_TRACK" || status === "WARNING" || status === "BREACHED") && (
          <span className="text-muted">
            due <RelativeTime value={dueAt} timezone={timezone} />
          </span>
        )}
    </span>
  );
}

/**
 * The inbox thread list: one row per lead with its latest reply. Keyboard: J and K move focus down
 * and up the list, so Enter opens the focused thread the way it opens any link; U marks the
 * highlighted thread unread and E assigns it.
 */
export function ThreadList({
  rows,
  selectedId,
  timezone,
  hasMore,
  nextLimit,
  canAssign,
  owners,
}: {
  rows: ThreadRowView[];
  selectedId: string | null;
  timezone: string;
  hasMore: boolean;
  nextLimit: number;
  canAssign: boolean;
  owners: SelectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState(() =>
    Math.max(
      rows.findIndex((row) => row.leadId === selectedId),
      0,
    ),
  );
  const [assigning, setAssigning] = useState<ThreadRowView | null>(null);

  // Rows can be removed by a refresh, so the highlighted index is clamped rather than stored blindly.
  const active = rows.length === 0 ? -1 : Math.min(cursor, rows.length - 1);
  const activeRow = active === -1 ? undefined : rows[active];

  function hrefWith(updates: Record<string, string | null>): string {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs.length > 0 ? `${pathname}?${qs}` : pathname;
  }

  /**
   * J and K move real focus to a row's link. The first press enters the list at the highlighted
   * row; after that each press moves one row. Focusing the link scrolls it into view, and Enter
   * then follows it natively. There is no Enter shortcut: a page-wide one would swallow Enter on
   * every button and link on the screen.
   */
  function moveFocus(step: 1 | -1) {
    const list = listRef.current;
    if (list === null || rows.length === 0 || overlayOpen()) return;
    const inList = list.contains(document.activeElement);
    const index = inList ? Math.min(Math.max(active + step, 0), rows.length - 1) : active;
    list.querySelector<HTMLAnchorElement>(`a[data-row="${String(index)}"]`)?.focus();
  }

  /** U and E act on the list, not on whatever control happens to have focus elsewhere. */
  function fromListOrPage(event: KeyboardEvent): boolean {
    if (overlayOpen()) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === document.body) return true;
    return listRef.current?.contains(target) === true;
  }

  function markUnread(row: ThreadRowView) {
    startTransition(async () => {
      const result = await markThreadUnreadAction(row.leadId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${row.companyName} marked unread.`);
      // Leaving the thread open would mark it read again straight away.
      if (row.leadId === selectedId) router.replace(hrefWith({ thread: null }), { scroll: false });
      else router.refresh();
    });
  }

  useShortcut(
    "j",
    () => {
      moveFocus(1);
    },
    { description: "Next thread" },
  );
  useShortcut(
    "k",
    () => {
      moveFocus(-1);
    },
    { description: "Previous thread" },
  );
  useShortcut(
    "u",
    (event) => {
      if (activeRow !== undefined && fromListOrPage(event)) markUnread(activeRow);
    },
    { description: "Mark the highlighted thread unread" },
  );
  useShortcut(
    "e",
    (event) => {
      if (activeRow !== undefined && canAssign && fromListOrPage(event)) setAssigning(activeRow);
    },
    { description: "Assign the highlighted thread", enabled: canAssign },
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No threads here"
        description="Replies appear here as they arrive. Clear a filter to see more."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul ref={listRef} aria-label="Threads" className="flex flex-col">
        {rows.map((row, index) => {
          const selected = row.leadId === selectedId;
          return (
            <li key={row.leadId}>
              <Link
                href={hrefWith({ thread: row.leadId })}
                scroll={false}
                data-row={index}
                aria-current={selected ? "true" : undefined}
                data-active={selected ? "true" : undefined}
                onFocus={() => {
                  setCursor(index);
                }}
                className={cn(
                  "flex flex-col gap-1.5 border-b border-border/60 px-3 py-3 hover:bg-zone focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected && "reading-rule bg-primary-soft/50",
                  index === active && !selected && "bg-zone",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {row.unread > 0 && (
                      <>
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                        <span className="sr-only">Unread.</span>
                      </>
                    )}
                    <span
                      className={cn(
                        "truncate text-heading",
                        row.unread > 0 ? "font-semibold" : "font-medium",
                      )}
                    >
                      {row.companyName}
                    </span>
                  </span>
                  <RelativeTime
                    value={row.latestAt}
                    timezone={timezone}
                    className="shrink-0 text-xs"
                  />
                </span>
                {row.summary !== null && (
                  <span className="line-clamp-2 text-sm break-words text-muted">{row.summary}</span>
                )}
                <span className="flex flex-wrap items-center gap-1.5">
                  {row.classification !== null && (
                    <StatusBadge kind="reply" value={row.classification} />
                  )}
                  {row.needsHumanReview && <ToneBadge tone="warning">Needs review</ToneBadge>}
                  <SlaIndicator status={row.slaStatus} dueAt={row.slaDueAt} timezone={timezone} />
                </span>
                <span className="flex items-center justify-between gap-2">
                  {row.market === null ? <span /> : <MarketBadge market={row.market} />}
                  {row.ownerName === null ? (
                    <span className="text-xs text-muted">
                      {row.ownerId === null ? "Unassigned" : "Assigned"}
                    </span>
                  ) : (
                    <OwnerAvatar name={row.ownerName} label={`Assigned to ${row.ownerName}.`} />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <Link
          href={hrefWith({ limit: String(nextLimit) })}
          scroll={false}
          className="inline-flex min-h-12 items-center self-center rounded-md px-4 text-sm font-semibold text-primary hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Load more threads
        </Link>
      )}

      <AssignDialog
        row={assigning}
        owners={owners}
        onOpenChange={(open) => {
          if (!open) setAssigning(null);
        }}
        onAssigned={() => {
          setAssigning(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function AssignDialog({
  row,
  owners,
  onOpenChange,
  onAssigned,
}: {
  row: ThreadRowView | null;
  owners: SelectOption[];
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING_DIALOG}>
        {row !== null && (
          <AssignBody
            row={row}
            owners={owners}
            onOpenChange={onOpenChange}
            onAssigned={onAssigned}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignBody({
  row,
  owners,
  onOpenChange,
  onAssigned,
}: {
  row: ThreadRowView;
  owners: SelectOption[];
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [ownerId, setOwnerId] = useState(row.ownerId ?? "");
  const [error, setError] = useState<string | null>(null);
  // The current owner is always listed, even if they have since left this line's team.
  const options = withPerson(
    owners,
    row.ownerId === null ? null : { id: row.ownerId, name: row.ownerName },
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">Assign {row.companyName}</DialogTitle>
      </DialogHeader>
      <Field label="Owner" required error={error}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={ownerId}
            placeholder="Choose an owner"
            options={options}
            onChange={(e) => {
              setOwnerId(e.target.value);
            }}
          />
        )}
      </Field>
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
          disabled={ownerId === "" || ownerId === row.ownerId}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await assignThreadAction(row.leadId, ownerId);
              if (result.ok) {
                toast.success(`${row.companyName} assigned.`);
                onAssigned();
              } else {
                setError(result.error.message);
              }
            });
          }}
        >
          Assign
        </Button>
      </DialogFooter>
    </>
  );
}
