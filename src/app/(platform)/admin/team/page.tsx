import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { SettingsSection, AdminTable, type AdminColumn } from "@/components/admin";
import { cn } from "@/lib/cn";
import { canFromUser, requireUser } from "@/platform/auth";
import { actorFromCurrentUser, getLineCapacity, listTeam, type TeamUserRow } from "@/platform/team";
import { getThrottleStatus } from "@/modules/acquisition/scoring";

import { CapacityWhatIf, EditTeamMemberButton } from "./_components/team-client";

export const metadata: Metadata = { title: "Team · Admin" };

const LINE_LABEL: Record<string, string> = {
  WEB_DEVELOPMENT: "Web Development",
  UI_UX_DESIGN: "UI/UX Design",
  GRAPHIC_DESIGN: "Graphic Design",
  VIDEO_EDITING: "Video Editing",
};
const LINE_SHORT: Record<string, string> = {
  WEB_DEVELOPMENT: "Web",
  UI_UX_DESIGN: "UI/UX",
  GRAPHIC_DESIGN: "Graphic",
  VIDEO_EDITING: "Video",
};
const MODE_TONE = { NORMAL: "success", SLOW: "warning", PAUSED: "danger" } as const;

export default async function TeamPage() {
  const user = await requireUser();
  if (!canFromUser(user, "platform.team.read")) {
    return <PermissionState description="You don't have access to the team." />;
  }

  const actor = actorFromCurrentUser(user);
  const [team, throttle] = await Promise.all([listTeam(actor, {}), getThrottleStatus()]);
  const caps = await Promise.all(throttle.map((t) => getLineCapacity(t.line)));
  const capByLine = new Map(caps.map((c) => [c.serviceLine, c]));
  const canUpdate = canFromUser(user, "platform.team.update");

  const columns: AdminColumn<TeamUserRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (m) => (
        <span className="flex flex-col">
          <span className="font-medium text-foreground">{m.name}</span>
          <span className="text-xs text-muted">{m.title ?? m.role.replace("_", " ").toLowerCase()}</span>
        </span>
      ),
    },
    {
      key: "lines",
      header: "Service lines",
      cell: (m) => (m.serviceLines.length === 0 ? "—" : m.serviceLines.map((l) => LINE_SHORT[l] ?? l).join(", ")),
    },
    { key: "capacity", header: "Capacity", align: "right", className: "font-mono tabular-nums", cell: (m) => String(m.weeklyCapacity) },
    { key: "load", header: "Load", align: "right", className: "font-mono tabular-nums", cell: (m) => String(m.currentLoad) },
    { key: "approve", header: "Approves", cell: (m) => (m.canApprove ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>) },
    { key: "tz", header: "Timezone", cell: (m) => m.timezone },
    ...(canUpdate
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (m: TeamUserRow) => (
              <EditTeamMemberButton
                member={{
                  userId: m.id,
                  name: m.name,
                  serviceLines: m.serviceLines,
                  weeklyCapacity: m.weeklyCapacity,
                  canApprove: m.canApprove,
                  timezone: m.timezone,
                  title: m.title,
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Admin" title="Team and capacity" description="Who works which lines, their weekly capacity and current load." />

      <SettingsSection eyebrow="Capacity" title="By service line" emphasized>
        <div className="grid gap-3 sm:grid-cols-2">
          {throttle.map((t) => {
            const cap = capByLine.get(t.line);
            const capacity = cap?.capacity ?? 0;
            const load = cap?.load ?? 0;
            const pct = Math.min(100, Math.round(t.percent));
            return (
              <div key={t.line} className="flex flex-col gap-2 rounded-lg bg-zone px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{LINE_LABEL[t.line] ?? t.line}</span>
                  <Badge tone={MODE_TONE[t.mode]}>{t.mode}</Badge>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface" aria-hidden>
                  <div
                    className={cn("h-full rounded-full", t.mode === "PAUSED" ? "bg-danger" : t.mode === "SLOW" ? "bg-warning" : "bg-primary")}
                    style={{ width: `${String(pct)}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  Load <span className="font-mono text-foreground">{load}</span> / {capacity} ·{" "}
                  {t.newFirstTouchesToday}/{t.dailyCap} first touches today
                </p>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection eyebrow="People" title="Team members">
        <AdminTable columns={columns} rows={team} getRowKey={(m) => m.id} caption="Team members" />
      </SettingsSection>

      {canUpdate && (
        <CapacityWhatIf members={team.map((m) => ({ id: m.id, name: m.name, weeklyCapacity: m.weeklyCapacity }))} />
      )}
    </div>
  );
}
