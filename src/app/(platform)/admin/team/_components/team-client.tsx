"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Select, SettingsSection } from "@/components/admin";
import { CheckboxField, ChipMultiSelect, NumberField } from "@/modules/acquisition/ui/settings/editor-fields";
import { capacityWhatIfAction, updateTeamProfileAction } from "../actions";

const LINE_OPTIONS = [
  { value: "WEB_DEVELOPMENT", label: "Web" },
  { value: "UI_UX_DESIGN", label: "UI/UX" },
  { value: "GRAPHIC_DESIGN", label: "Graphic" },
  { value: "VIDEO_EDITING", label: "Video" },
];
const TIMEZONES = ["Africa/Lagos", "Europe/London", "UTC", "America/New_York", "Europe/Paris"];
const LINE_LABEL: Record<string, string> = {
  WEB_DEVELOPMENT: "Web Development",
  UI_UX_DESIGN: "UI/UX Design",
  GRAPHIC_DESIGN: "Graphic Design",
  VIDEO_EDITING: "Video Editing",
};

export interface TeamMemberEdit {
  userId: string;
  name: string;
  serviceLines: string[];
  weeklyCapacity: number;
  canApprove: boolean;
  timezone: string;
  title: string | null;
}

export function EditTeamMemberButton({ member }: { member: TeamMemberEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState(member.serviceLines);
  const [capacity, setCapacity] = useState(member.weeklyCapacity);
  const [canApprove, setCanApprove] = useState(member.canApprove);
  const [timezone, setTimezone] = useState(member.timezone);
  const [title, setTitle] = useState(member.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamProfileAction(member.userId, {
        serviceLines: lines,
        weeklyCapacity: capacity,
        canApprove,
        timezone,
        title: title.trim() === "" ? null : title.trim(),
      });
      if (result.ok) {
        toast.success("Team profile updated.");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setOpen(true); }}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {member.name}</DialogTitle>
            <DialogDescription>Service lines, capacity and approval rights.</DialogDescription>
          </DialogHeader>
          <ChipMultiSelect label="Service lines" values={lines} options={LINE_OPTIONS} onChange={setLines} />
          <NumberField label="Weekly capacity" value={capacity} min={0} max={40} onChange={(v) => { setCapacity(v ?? 0); }} />
          <Field label="Title">
            {({ id }) => <Input id={id} value={title} onChange={(e) => { setTitle(e.target.value); }} />}
          </Field>
          <Field label="Timezone">
            {({ id }) => (
              <Select
                id={id}
                value={timezone}
                options={Array.from(new Set([member.timezone, ...TIMEZONES])).map((t) => ({ value: t, label: t }))}
                onChange={(e) => { setTimezone(e.target.value); }}
              />
            )}
          </Field>
          <CheckboxField label="Can approve outreach and proposals" checked={canApprove} onChange={setCanApprove} />
          {error != null && <p role="alert" aria-live="polite" className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setOpen(false); }} disabled={pending}>Cancel</Button>
            <Button onClick={submit} loading={pending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CapacityWhatIf({ members }: { members: { id: string; name: string; weeklyCapacity: number }[] }) {
  const [userId, setUserId] = useState(members[0]?.id ?? "");
  const [capacity, setCapacity] = useState(members[0]?.weeklyCapacity ?? 0);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await capacityWhatIfAction(userId, capacity);
      if (!res.ok) {
        setResult(res.error.message);
        return;
      }
      if (res.data.transitions.length === 0) {
        setResult("No change to any line's throttle.");
      } else {
        setResult(
          res.data.transitions
            .map((t) => `${LINE_LABEL[t.line] ?? t.line}: ${t.from} → ${t.to}`)
            .join(" · "),
        );
      }
    });
  }

  return (
    <SettingsSection eyebrow="What-if" title="Capacity planner" description="See how changing one person's weekly capacity would move each line's throttle.">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Person">
          {({ id }) => (
            <Select
              id={id}
              value={userId}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(e) => {
                setUserId(e.target.value);
                setCapacity(members.find((m) => m.id === e.target.value)?.weeklyCapacity ?? 0);
              }}
            />
          )}
        </Field>
        <NumberField label="New weekly capacity" value={capacity} min={0} max={40} onChange={(v) => { setCapacity(v ?? 0); }} />
        <Button onClick={run} loading={pending} disabled={userId === ""}>Compute</Button>
      </div>
      {result !== null && <p aria-live="polite" className="text-sm text-foreground">{result}</p>}
    </SettingsSection>
  );
}
