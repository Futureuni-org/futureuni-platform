"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { SelectOption } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/states";

import { loadMoreLeadsAction } from "./actions";
import { BulkActionsBar, type LeadCapabilities } from "./bulk-actions-bar";
import { ButtonLink } from "./button-link";
import type { BuiltinView } from "./lead-filters";
import { LeadsFilterBar } from "./leads-filter-bar";
import { LeadsTable, type LeadRowView } from "./leads-table";
import { SavedViews, type SavedView } from "./saved-views";

const NO_ROWS: LeadRowView[] = [];
const NO_SELECTION: ReadonlySet<string> = new Set();

/**
 * The leads list's client state: rows loaded with "Load more", and the selection for bulk actions.
 * Both belong to the page of results the server sent (`initialRows`). When the server sends a new
 * one (a filter changed, or a bulk action refreshed the list) they no longer apply, so they are
 * tagged with the rows they were built on and ignored once those change.
 */
export function LeadsClient({
  initialRows,
  initialCursor,
  serviceLine,
  query,
  basePath,
  timezone,
  owners,
  ownerFilter,
  sources,
  signalTypes,
  builtins,
  savedViews,
  capabilities,
}: {
  initialRows: LeadRowView[];
  initialCursor: string | null;
  serviceLine: string;
  query: Record<string, string>;
  basePath: string;
  timezone: string;
  /** The people a lead on this line can be assigned to. */
  owners: SelectOption[];
  /** The people the list can be filtered by: the team, plus the viewer for "My leads". */
  ownerFilter: SelectOption[];
  sources: string[];
  signalTypes: string[];
  builtins: BuiltinView[];
  savedViews: SavedView[];
  capabilities: LeadCapabilities;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [more, setMore] = useState<{
    source: LeadRowView[];
    rows: LeadRowView[];
    cursor: string | null;
  }>({ source: initialRows, rows: NO_ROWS, cursor: initialCursor });
  const [selection, setSelection] = useState<{ source: LeadRowView[]; ids: ReadonlySet<string> }>({
    source: initialRows,
    ids: NO_SELECTION,
  });

  const current = more.source === initialRows;
  const extraRows = current ? more.rows : NO_ROWS;
  const cursor = current ? more.cursor : initialCursor;
  const rows = useMemo(() => [...initialRows, ...extraRows], [initialRows, extraRows]);
  const selected = selection.source === initialRows ? selection.ids : NO_SELECTION;

  function select(update: (ids: Set<string>) => void) {
    setSelection((previous) => {
      const ids = new Set(previous.source === initialRows ? previous.ids : NO_SELECTION);
      update(ids);
      return { source: initialRows, ids };
    });
  }

  function toggle(id: string) {
    select((ids) => {
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
    });
  }

  function toggleAll(ids: string[], on: boolean) {
    select((selectedIds) => {
      for (const id of ids) {
        if (on) selectedIds.add(id);
        else selectedIds.delete(id);
      }
    });
  }

  function clearSelection() {
    setSelection({ source: initialRows, ids: NO_SELECTION });
  }

  function loadMore() {
    if (cursor === null) return;
    startTransition(async () => {
      const result = await loadMoreLeadsAction(serviceLine, query, cursor);
      if (result.ok) {
        setMore((previous) => ({
          source: initialRows,
          rows: [
            ...(previous.source === initialRows ? previous.rows : NO_ROWS),
            ...result.data.items,
          ],
          cursor: result.data.nextCursor,
        }));
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <LeadsFilterBar
        owners={ownerFilter}
        sources={sources}
        signalTypes={signalTypes}
        basePath={basePath}
      />
      <SavedViews builtins={builtins} views={savedViews} serviceLine={serviceLine} />

      {rows.length === 0 ? (
        Object.keys(query).length > 0 ? (
          <EmptyState
            title="No leads match these filters"
            description="Adjust the filters, or clear them to see every lead in this line."
            action={
              <ButtonLink href={basePath} variant="secondary" scroll={false}>
                Clear filters
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            title="No leads in this line yet"
            description="Run a search or import a list to bring in the first leads."
          />
        )
      ) : (
        <>
          <LeadsTable
            rows={rows}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            timezone={timezone}
          />
          {cursor !== null && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={pending}>
                Load more leads
              </Button>
            </div>
          )}
        </>
      )}

      {selected.size > 0 && (
        <BulkActionsBar
          selectedIds={[...selected]}
          owners={owners}
          capabilities={capabilities}
          timezone={timezone}
          onClear={clearSelection}
          onDone={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
