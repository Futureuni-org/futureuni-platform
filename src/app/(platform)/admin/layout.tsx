import type { ReactNode } from "react";

import { PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import type { PermissionAction } from "@/contracts/permissions";

import { AdminNav, type AdminNavItem } from "./_components/admin-nav";

/**
 * The `/admin` frame. Gated by `platform.admin.access` (ADMIN and MANAGER). Each nav item is
 * shown only when the viewer may open it; every page below also re-checks its own action on the
 * server (defence in depth — the UI gate is never the authorization control).
 */

const NAV: { href: string; label: string; action: PermissionAction }[] = [
  { href: "/admin/users", label: "Users", action: "platform.user.read" },
  { href: "/admin/team", label: "Team", action: "platform.team.read" },
  { href: "/admin/integrations", label: "Integrations", action: "platform.credential.read" },
  { href: "/admin/mailboxes", label: "Mailboxes", action: "acquisition.mailbox.read" },
  { href: "/admin/suppression", label: "Suppression", action: "acquisition.suppression.read" },
  { href: "/admin/data-requests", label: "Data requests", action: "acquisition.dsr.manage" },
  { href: "/admin/prompts", label: "Prompts", action: "platform.prompt.read" },
  { href: "/admin/ai-usage", label: "AI usage", action: "platform.aiUsage.read" },
  { href: "/admin/jobs", label: "Jobs", action: "platform.job.read" },
  { href: "/admin/audit", label: "Audit log", action: "platform.audit.read" },
  { href: "/admin/platform", label: "Platform", action: "platform.setting.read" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  if (!canFromUser(user, "platform.admin.access")) {
    return (
      <PermissionState
        title="Admin access only"
        description="The admin area is available to administrators and managers."
      />
    );
  }

  const items: AdminNavItem[] = NAV.filter((item) => canFromUser(user, item.action)).map(
    ({ href, label }) => ({ href, label }),
  );

  return (
    <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Admin</p>
        <AdminNav items={items} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
