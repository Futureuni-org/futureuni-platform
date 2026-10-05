import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { ErrorState, PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import {
  getActiveProfile,
  getDraft,
  listProfileVersions,
} from "@/modules/acquisition/profiles";
import { getThrottleStatus } from "@/modules/acquisition/scoring";
import { actorFromCurrentUser, getLineCapacity, listTeam } from "@/platform/team";
import { resolveLine } from "@/modules/acquisition/ui/shell";
import { countNurtureHeld } from "@/modules/acquisition/ui/settings/sample-leads.repo";
import { ProfileEditor } from "@/modules/acquisition/ui/settings/profile-editor";
import type { CapacitySummary } from "@/modules/acquisition/ui/settings/capacity-panel";
import type { VersionRow } from "@/modules/acquisition/ui/settings/version-history";

export const metadata: Metadata = { title: "Line settings" };

export default async function LineSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.profile.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to this line"
        description="You can only view the settings of service lines you work on."
      />
    );
  }

  const sp = await searchParams;
  const section = typeof sp.section === "string" ? sp.section : "overview";

  const canEdit = canFromUser(user, "acquisition.profile.edit", { serviceLine: ctx.line });

  const [active, draft, versions, throttleList, lineCap, nurtureHeld, teamUsers] = await Promise.all([
    getActiveProfile(ctx.line).catch(() => null),
    getDraft(ctx.line),
    listProfileVersions(ctx.line),
    getThrottleStatus(),
    getLineCapacity(ctx.line),
    countNurtureHeld(ctx.line),
    canEdit ? loadTeamUsers(user, ctx.line) : Promise.resolve([]),
  ]);

  const activeProfile = active ?? draft?.profile ?? null;
  if (activeProfile === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={ctx.label} title="Line settings" />
        <ErrorState
          title="No profile for this line yet"
          description="This line has no active profile or draft. It should be seeded on first run."
        />
      </div>
    );
  }

  const throttle = throttleList.find((t) => t.line === ctx.line) ?? null;
  const capacity: CapacitySummary | null =
    throttle === null
      ? null
      : {
          mode: throttle.mode,
          dailyCap: throttle.dailyCap,
          newFirstTouchesToday: throttle.newFirstTouchesToday,
          remaining: throttle.remaining,
          percent: throttle.percent,
          reason: throttle.reason,
          capacity: lineCap.capacity,
          load: lineCap.load,
          nurtureHeld,
        };

  const versionRows: VersionRow[] = versions.map((v) => ({
    version: v.version,
    status: v.status,
    isActive: v.isActive,
    note: v.note,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  }));

  const activeVersion = versions.find((v) => v.isActive)?.version ?? null;

  return (
    <ProfileEditor
      slug={slug}
      lineLabel={ctx.label}
      active={activeProfile}
      initialDraft={draft?.profile ?? null}
      activeVersion={activeVersion}
      canEdit={canEdit}
      canPublish={canFromUser(user, "acquisition.profile.publish", { serviceLine: ctx.line })}
      canRollback={canFromUser(user, "acquisition.profile.rollback", { serviceLine: ctx.line })}
      isAdmin={user.role === "ADMIN"}
      teamUsers={teamUsers}
      versions={versionRows}
      capacity={capacity}
      timezone={user.timezone}
      initialSection={section}
    />
  );
}

async function loadTeamUsers(
  user: Parameters<typeof actorFromCurrentUser>[0],
  line: Parameters<typeof getLineCapacity>[0],
): Promise<{ id: string; name: string | null; email: string }[]> {
  try {
    const team = await listTeam(actorFromCurrentUser(user), { serviceLine: line });
    return team.map((u) => ({ id: u.id, name: u.name, email: u.email }));
  } catch {
    return [];
  }
}
