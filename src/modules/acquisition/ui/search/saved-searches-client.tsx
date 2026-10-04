"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/admin";
import { EmptyState } from "@/components/patterns/states";
import type { ServiceLine } from "@/contracts/common";

import {
  deleteSavedSearchAction,
  duplicateSavedSearchAction,
  runSavedSearchNowAction,
  setSavedSearchEnabledAction,
} from "./actions";
import { SavedSearchForm, type SavedSearchFormValues } from "./saved-search-form";
import type { SearchDraft, SourceOption } from "./types";

/** A saved search as the list shows it. */
export interface SavedSearchDTO {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  scheduleLabel: string;
  specSummary: string;
  enabled: boolean;
  pausedReason: string | null;
  skippedAtCapacity: boolean;
  ownerId: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  draft: SearchDraft;
}

export function SavedSearchesClient({
  slug,
  line,
  rows,
  sourceOptions,
  owners,
  canManage,
  timezone,
}: {
  slug: string;
  line: ServiceLine;
  rows: SavedSearchDTO[];
  sourceOptions: SourceOption[];
  owners: { id: string; name: string }[];
  canManage: boolean;
  timezone: string;
}): React.ReactElement {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavedSearchDTO | null>(null);
  const [deleting, setDeleting] = useState<SavedSearchDTO | null>(null);

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(row: SavedSearchDTO): void {
    setEditing(row);
    setFormOpen(true);
  }

  async function run(id: string): Promise<void> {
    const res = await runSavedSearchNowAction(slug, id);
    if (res.ok) toast.success("Run started");
    else toast.error(res.error.message);
    router.refresh();
  }
  async function toggle(row: SavedSearchDTO): Promise<void> {
    const res = await setSavedSearchEnabledAction(slug, row.id, !row.enabled);
    if (res.ok) toast.success(row.enabled ? "Paused" : "Resumed");
    else toast.error(res.error.message);
    router.refresh();
  }
  async function duplicate(id: string): Promise<void> {
    const res = await duplicateSavedSearchAction(slug, id);
    if (res.ok) toast.success("Duplicated (paused)");
    else toast.error(res.error.message);
    router.refresh();
  }

  const formInitial: SavedSearchFormValues =
    editing !== null
      ? {
          name: editing.name,
          draft: editing.draft,
          cron: editing.cron,
          timezone: editing.timezone,
          enabled: editing.enabled,
          ownerId: editing.ownerId,
        }
      : {
          name: "",
          draft: { market: "NIGERIA", ngLocation: "", intlLocation: "", keywords: [], sources: [], limit: 50 },
          cron: "0 9 * * 1-5",
          timezone: "Africa/Lagos",
          enabled: true,
          ownerId: owners[0]?.id ?? "",
        };

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <div>
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            New saved search
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No saved searches"
          description="Save a search on a schedule and new leads arrive without you."
          {...(canManage ? { action: <Button onClick={openCreate}>Save your first scheduled search</Button> } : {})}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-soft sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-heading">{row.name}</span>
                  <StatusPill enabled={row.enabled} skipped={row.skippedAtCapacity} />
                </div>
                <p className="text-sm text-muted">{row.specSummary}</p>
                <p className="text-sm text-muted">
                  {row.scheduleLabel}
                  {row.nextRunAt !== null ? (
                    <>
                      {" · next "}
                      <RelativeTime value={new Date(row.nextRunAt)} timezone={timezone} />
                    </>
                  ) : null}
                  {row.lastRunAt !== null ? (
                    <>
                      {" · last "}
                      <RelativeTime value={new Date(row.lastRunAt)} timezone={timezone} />
                    </>
                  ) : null}
                </p>
                {row.skippedAtCapacity ? (
                  <p className="text-sm text-warning">Skipped: line at capacity.</p>
                ) : null}
              </div>

              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" aria-label={`Actions for ${row.name}`}>
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { openEdit(row); }}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void toggle(row)}>
                      {row.enabled ? "Pause" : "Resume"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void run(row.id)}>Run now</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void duplicate(row.id)}>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setDeleting(row); }}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <SavedSearchForm
          slug={slug}
          line={line}
          sourceOptions={sourceOptions}
          owners={owners}
          mode={editing !== null ? "edit" : "create"}
          {...(editing !== null ? { savedSearchId: editing.id } : {})}
          initial={formInitial}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={() => {
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this saved search?"
        description={deleting !== null ? `"${deleting.name}" will stop running. This can't be undone.` : undefined}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          if (deleting === null) return { ok: true as const, data: null };
          const res = await deleteSavedSearchAction(slug, deleting.id);
          if (res.ok) {
            toast.success("Saved search deleted");
            setDeleting(null);
            router.refresh();
          }
          return res;
        }}
      />
    </div>
  );
}

function StatusPill({ enabled, skipped }: { enabled: boolean; skipped: boolean }): React.ReactElement {
  if (skipped) {
    return <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">At capacity</span>;
  }
  return enabled ? (
    <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Enabled</span>
  ) : (
    <span className="rounded-full bg-zone px-2 py-0.5 text-xs font-medium text-muted">Paused</span>
  );
}
