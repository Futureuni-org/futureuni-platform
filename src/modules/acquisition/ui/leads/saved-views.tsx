"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BookmarkPlus, Check, X } from "lucide-react";

import { Field } from "@/components/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

import { deleteLeadViewAction, saveLeadViewAction } from "./actions";
import { SCROLLING_DIALOG } from "./dialog-scroll";
import { LEAD_FILTER_KEYS, type BuiltinView } from "./lead-filters";

export interface SavedView {
  id: string;
  name: string;
  query: Record<string, string>;
}

function hrefFor(pathname: string, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  return qs.length > 0 ? `${pathname}?${qs}` : pathname;
}

/** A query as a string that doesn't depend on the order of its params, for comparing two views. */
function queryKey(query: Record<string, string>): string {
  return Object.entries(query)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

const CHIP =
  "inline-flex min-h-12 items-center gap-1.5 rounded-full border text-sm font-medium transition-colors";
const CHIP_ON = "border-primary bg-primary-soft text-primary-soft-foreground";
const CHIP_OFF = "border-border text-muted";
const FOCUS = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function SavedViews({
  builtins,
  views,
  serviceLine,
}: {
  builtins: BuiltinView[];
  views: SavedView[];
  serviceLine: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Only the list's own filters are a "view": anything else in the URL is left out, and the server
  // refuses a saved view that carries any other key.
  const currentQuery = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of LEAD_FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value !== null && value !== "") out[key] = value;
    }
    return out;
  }, [searchParams]);

  const currentKey = queryKey(currentQuery);
  const hasQuery = currentKey.length > 0;

  function isActive(query: Record<string, string>): boolean {
    return queryKey(query) === currentKey;
  }

  function save(name: string) {
    startTransition(async () => {
      const result = await saveLeadViewAction(serviceLine, name, currentQuery);
      if (result.ok) {
        toast.success(`Saved view “${name}”.`);
        setOpen(false);
        // The list of views is server-rendered, so it is fetched again to show the new one.
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function remove(view: SavedView) {
    startTransition(async () => {
      const result = await deleteLeadViewAction(view.id);
      if (result.ok) {
        toast.success(`Removed “${view.name}”.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <nav aria-label="Saved views" className="flex flex-wrap items-center gap-2">
      {builtins.map((view) => {
        const active = isActive(view.query);
        return (
          <Link
            key={view.id}
            href={hrefFor(pathname, view.query)}
            aria-current={active ? "true" : undefined}
            className={cn(
              CHIP,
              FOCUS,
              "px-4",
              active ? CHIP_ON : cn(CHIP_OFF, "hover:text-foreground"),
            )}
          >
            {/* The view in use is marked by the tick as well as the colour. */}
            {active && <Check aria-hidden className="size-4" />}
            {view.label}
          </Link>
        );
      })}

      {views.map((view) => {
        const active = isActive(view.query);
        return (
          <span key={view.id} className={cn(CHIP, "pl-4", active ? CHIP_ON : CHIP_OFF)}>
            <Link
              href={hrefFor(pathname, view.query)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-12 max-w-[16rem] items-center gap-1.5 rounded-full hover:text-foreground",
                FOCUS,
              )}
            >
              {active && <Check aria-hidden className="size-4 shrink-0" />}
              <span className="truncate">{view.name}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                remove(view);
              }}
              disabled={pending}
              aria-label={`Delete saved view ${view.name}`}
              className={cn(
                "inline-flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-zone disabled:opacity-60",
                FOCUS,
              )}
            >
              <X aria-hidden className="size-4" />
            </button>
          </span>
        );
      })}

      {hasQuery && (
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(true);
          }}
        >
          <BookmarkPlus aria-hidden className="size-4" />
          Save view
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={SCROLLING_DIALOG}>
          {/* Mounted only while open, so the name starts empty each time. */}
          {open && (
            <SaveViewForm
              pending={pending}
              onCancel={() => {
                setOpen(false);
              }}
              onSave={save}
            />
          )}
        </DialogContent>
      </Dialog>
    </nav>
  );
}

function SaveViewForm({
  pending,
  onCancel,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed !== "") onSave(trimmed);
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Save this view</DialogTitle>
        <DialogDescription>
          Saves the filters you have on now. A view with the same name is replaced.
        </DialogDescription>
      </DialogHeader>
      <Field label="View name" required>
        {({ id }) => (
          <Input
            id={id}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="e.g. High-score Lagos"
            maxLength={60}
          />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={trimmed === ""}>
          Save view
        </Button>
      </DialogFooter>
    </form>
  );
}
