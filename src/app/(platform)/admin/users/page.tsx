import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { SettingsSection, AdminTable, FilterBar, UrlSearchInput, UrlSelect, type AdminColumn } from "@/components/admin";
import { canFromUser, requireUser } from "@/platform/auth";
import { listUsers, type ListedUser } from "@/platform/auth/users";
import { actorFromCurrentUser, listTeam } from "@/platform/team";
import type { Role, ServiceLine } from "@/contracts/common";

import { listPendingInvites, type PendingInvite } from "./invites.repo";
import {
  InviteDialog,
  PendingInviteActions,
  UserActions,
  type UserCapabilities,
} from "./_components/users-client";

export const metadata: Metadata = { title: "Users · Admin" };

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  SERVICE_LEAD: "Service lead",
  MEMBER: "Member",
};
const LINE_SHORT: Record<string, string> = {
  WEB_DEVELOPMENT: "Web",
  UI_UX_DESIGN: "UI/UX",
  GRAPHIC_DESIGN: "Graphic",
  VIDEO_EDITING: "Video",
};
const ROLES = new Set<Role>(["ADMIN", "MANAGER", "SERVICE_LEAD", "MEMBER"]);

interface Row extends ListedUser {
  serviceLines: ServiceLine[];
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!canFromUser(user, "platform.user.read")) {
    return <PermissionState description="Only administrators and managers can view users." />;
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v === "" ? undefined : v;
  const roleParam = one(sp.role);
  const statusParam = one(sp.status);
  const search = one(sp.q);
  const cursor = one(sp.cursor);

  const role = roleParam !== undefined && ROLES.has(roleParam as Role) ? (roleParam as Role) : undefined;
  const status = statusParam === "ACTIVE" || statusParam === "DEACTIVATED" ? statusParam : undefined;

  const adminActor = { id: user.id, role: user.role, canApprove: user.canApprove };
  const [{ items, nextCursor }, team] = await Promise.all([
    listUsers(adminActor, {
      ...(role === undefined ? {} : { role }),
      ...(status === undefined ? {} : { status }),
      ...(search === undefined ? {} : { search }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: 50,
    }),
    canFromUser(user, "platform.team.read")
      ? listTeam(actorFromCurrentUser(user), {})
      : Promise.resolve([]),
  ]);
  const linesByUser = new Map(team.map((t) => [t.id, t.serviceLines]));
  const rows: Row[] = items.map((u) => ({ ...u, serviceLines: linesByUser.get(u.id) ?? [] }));

  const pendingInvites = canFromUser(user, "platform.user.invite") ? await listPendingInvites() : [];

  const caps: UserCapabilities = {
    canChangeRole: canFromUser(user, "platform.user.changeRole"),
    canDeactivate: canFromUser(user, "platform.user.deactivate"),
    canReset2fa: canFromUser(user, "platform.user.reset2fa"),
    canForceSignOut: canFromUser(user, "platform.user.forceSignOut"),
  };

  const columns: AdminColumn<Row>[] = [
    {
      key: "name",
      header: "Name",
      cell: (u) => (
        <span className="flex flex-col">
          <span className="font-medium text-foreground">{u.name}</span>
          <span className="text-xs text-muted">{u.email}</span>
        </span>
      ),
    },
    { key: "role", header: "Role", cell: (u) => <Badge tone="neutral">{ROLE_LABEL[u.role] ?? u.role}</Badge> },
    {
      key: "lines",
      header: "Service lines",
      cell: (u) =>
        u.serviceLines.length === 0 ? "—" : u.serviceLines.map((l) => LINE_SHORT[l] ?? l).join(", "),
    },
    {
      key: "2fa",
      header: "2FA",
      cell: (u) =>
        u.twoFactorEnabled ? (
          <Badge tone="success">On</Badge>
        ) : u.mustSetUp2fa ? (
          <Badge tone="warning">Setup required</Badge>
        ) : (
          <Badge tone="neutral">Off</Badge>
        ),
    },
    {
      key: "last",
      header: "Last active",
      cell: (u) =>
        u.lastActiveAt === null ? (
          <span className="text-muted">Never</span>
        ) : (
          <RelativeTime value={u.lastActiveAt} timezone={user.timezone} />
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) =>
        u.status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (u) => (
        <UserActions
          userId={u.id}
          userName={u.name}
          role={u.role}
          status={u.status}
          caps={u.id === user.id ? { canChangeRole: false, canDeactivate: false, canReset2fa: false, canForceSignOut: caps.canForceSignOut } : caps}
        />
      ),
    },
  ];

  const loadMore = new URLSearchParams();
  if (role !== undefined) loadMore.set("role", role);
  if (status !== undefined) loadMore.set("status", status);
  if (search !== undefined) loadMore.set("q", search);
  if (nextCursor !== null) loadMore.set("cursor", nextCursor);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="People with access to the platform. The last active admin can't be removed or demoted."
        actions={canFromUser(user, "platform.user.invite") ? <InviteDialog inviterRole={user.role} /> : undefined}
      />

      <FilterBar>
        <UrlSearchInput label="Search users" placeholder="Search name or email" />
        <UrlSelect paramKey="role" label="Role" options={Object.keys(ROLE_LABEL).map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))} />
        <UrlSelect paramKey="status" label="Status" options={[{ value: "ACTIVE", label: "Active" }, { value: "DEACTIVATED", label: "Deactivated" }]} />
      </FilterBar>

      <AdminTable
        columns={columns}
        rows={rows}
        getRowKey={(u) => u.id}
        caption="Platform users"
        empty={<EmptyState title="No users match" description="Adjust the filters." />}
      />

      {nextCursor !== null && (
        <div>
          <Link
            href={`/admin/users?${loadMore.toString()}`}
            className="inline-flex h-9 items-center rounded-md border border-input bg-surface px-3 text-sm font-semibold text-foreground hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Load more
          </Link>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <SettingsSection eyebrow="Invites" title="Pending invites">
          <AdminTable
            columns={pendingColumns(user.timezone)}
            rows={pendingInvites}
            getRowKey={(i) => i.id}
            caption="Pending invites"
          />
        </SettingsSection>
      )}
    </div>
  );
}

function pendingColumns(timezone: string): AdminColumn<PendingInvite>[] {
  return [
    { key: "email", header: "Email", cell: (i) => i.email },
    { key: "role", header: "Role", cell: (i) => ROLE_LABEL[i.role] ?? i.role },
    {
      key: "lines",
      header: "Service lines",
      cell: (i) => (i.serviceLines.length === 0 ? "—" : i.serviceLines.map((l) => LINE_SHORT[l] ?? l).join(", ")),
    },
    { key: "expires", header: "Expires", cell: (i) => <RelativeTime value={i.expiresAt} timezone={timezone} /> },
    { key: "actions", header: "", align: "right", cell: (i) => <PendingInviteActions inviteId={i.id} /> },
  ];
}
