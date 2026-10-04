"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Input } from "@/components/ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Select } from "@/components/admin";
import { toast } from "sonner";
import type { ServiceLine } from "@/contracts/common";

import { createSavedSearchAction, updateSavedSearchAction } from "./actions";
import { previewCronAction, type CronPreview } from "./cron-actions";
import { Field, SpecFields, validateDraft } from "./spec-fields";
import { toSearchSpec, type SearchDraft, type SourceOption } from "./types";

/**
 * Create or edit a saved (scheduled) search: the same spec fields as the panel, plus a name,
 * schedule (presets or a custom cron with a live preview and the next 3 run times), timezone and
 * owner.
 */

const SCHEDULE_PRESETS = [
  { label: "Weekdays at 09:00", value: "0 9 * * 1-5" },
  { label: "Every day at 09:00", value: "0 9 * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every Monday at 09:00", value: "0 9 * * 1" },
  { label: "Custom…", value: "custom" },
];
const PRESET_VALUES = new Set(SCHEDULE_PRESETS.map((p) => p.value).filter((v) => v !== "custom"));

export interface SavedSearchFormValues {
  name: string;
  draft: SearchDraft;
  cron: string;
  timezone: string;
  enabled: boolean;
  ownerId: string;
}

export function SavedSearchForm({
  slug,
  line,
  sourceOptions,
  owners,
  mode,
  savedSearchId,
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  slug: string;
  line: ServiceLine;
  sourceOptions: SourceOption[];
  owners: { id: string; name: string }[];
  mode: "create" | "edit";
  savedSearchId?: string;
  initial: SavedSearchFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): React.ReactElement {
  const [name, setName] = useState(initial.name);
  const [draft, setDraft] = useState(initial.draft);
  const [cron, setCron] = useState(initial.cron);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [preset, setPreset] = useState(PRESET_VALUES.has(initial.cron) ? initial.cron : "custom");
  const [preview, setPreview] = useState<CronPreview | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form whenever it's opened for a different target.
  const openedFor = useRef<string>("");
  useEffect(() => {
    const token = `${mode}:${savedSearchId ?? "new"}:${open ? "1" : "0"}`;
    if (open && openedFor.current !== token) {
      openedFor.current = token;
      setName(initial.name);
      setDraft(initial.draft);
      setCron(initial.cron);
      setTimezone(initial.timezone);
      setEnabled(initial.enabled);
      setOwnerId(initial.ownerId);
      setPreset(PRESET_VALUES.has(initial.cron) ? initial.cron : "custom");
    }
  }, [open, mode, savedSearchId, initial]);

  // Live cron preview, debounced.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void previewCronAction(cron, timezone).then((res) => {
        setPreview(res.ok ? res.data : { valid: false, description: "That schedule isn't valid.", nextRuns: [] });
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [cron, timezone]);

  const specError = useMemo(() => validateDraft(draft), [draft]);
  const nameError = name.trim().length < 2 ? "Give the saved search a name." : null;
  const canSave = specError === null && nameError === null && preview?.valid === true && !saving;

  async function save(): Promise<void> {
    setSaving(true);
    const spec = toSearchSpec(line, draft);
    const form = { name: name.trim(), cron: cron.trim(), timezone: timezone.trim(), enabled, ownerId: ownerId.length > 0 ? ownerId : undefined };
    const res =
      mode === "edit" && savedSearchId !== undefined
        ? await updateSavedSearchAction(slug, savedSearchId, spec, form)
        : await createSavedSearchAction(slug, spec, form);
    setSaving(false);
    if (res.ok) {
      toast.success(mode === "edit" ? "Saved search updated" : "Saved search created");
      onOpenChange(false);
      onSaved();
    } else {
      toast.error(res.error.message);
    }
  }

  const tzFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
    } catch {
      return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
    }
  }, [timezone]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-5 overflow-y-auto sm:max-w-xl">
        <SheetTitle>{mode === "edit" ? "Edit saved search" : "Save as scheduled search"}</SheetTitle>
        <SheetDescription>
          Scheduled searches run on their own and drop new leads into Review. They skip when the line is at capacity.
        </SheetDescription>

        <Field label="Name" error={nameError ?? undefined}>
          <Input value={name} onChange={(e) => { setName(e.target.value); }} placeholder="e.g. Lagos restaurants" />
        </Field>

        <SpecFields draft={draft} onChange={(p) => { setDraft((d) => ({ ...d, ...p })); }} sourceOptions={sourceOptions} />

        <Field label="Schedule">
          <Select
            options={SCHEDULE_PRESETS}
            value={preset}
            onChange={(e) => {
              const next = e.target.value;
              setPreset(next);
              if (next !== "custom") setCron(next);
            }}
          />
        </Field>
        {preset === "custom" ? (
          <Field label="Cron expression" hint="Five fields: minute hour day month weekday.">
            <Input value={cron} onChange={(e) => { setCron(e.target.value); }} placeholder="0 9 * * 1-5" className="font-mono" />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone">
            <Input value={timezone} onChange={(e) => { setTimezone(e.target.value); }} placeholder="Africa/Lagos" />
          </Field>
          {owners.length > 0 ? (
            <Field label="Owner">
              <Select
                options={owners.map((o) => ({ value: o.id, label: o.name }))}
                value={ownerId}
                placeholder="Choose an owner"
                onChange={(e) => { setOwnerId(e.target.value); }}
              />
            </Field>
          ) : null}
        </div>

        <div className="rounded-md bg-zone px-3 py-2.5 text-sm">
          <p className="font-medium text-foreground">{preview?.description ?? "Checking the schedule…"}</p>
          {preview !== null && preview.nextRuns.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-muted">
              {preview.nextRuns.map((iso) => (
                <li key={iso} className="font-mono text-xs tabular-nums">
                  {tzFormatter.format(new Date(iso))}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); }}
            style={{ accentColor: "var(--primary)" }}
            className="size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          Enabled (runs on its schedule)
        </label>

        {specError !== null ? <p className="text-sm text-danger" role="alert">{specError}</p> : null}

        <div className="mt-auto flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => { onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create saved search"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
