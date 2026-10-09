import "server-only";

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { InstallAppBanner } from "@/components/pwa";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canFromUser, getCurrentUser } from "@/platform/auth";
import { listForUser, markRead, unreadCount } from "@/platform/notifications";
import { getEnabledModules, getNavigation } from "@/platform/registry";
import { getSetting } from "@/platform/settings";
import type { ModuleManifest, NavItem } from "@/contracts/module-manifest";

import { MobileNav } from "./mobile-nav";
import { OutreachPausedBanner } from "./outreach-paused-banner";
import type { NavigationGroup, NavigationEntry } from "./nav-tree";
import type { ShellNotification } from "./notification-bell";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import type { ShellUser } from "./user-menu";

/**
 * The signed-in platform shell. Server component. Loads the real session, navigation and the
 * notification bell payload; hands plain data to client components.
 *
 * The `src/proxy.ts` middleware already redirects anonymous requests to `/login?next=…`. The
 * explicit `redirect("/login")` here is a fallback for sessions that expire mid-request.
 */
export async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");

  // Required 2FA is enforced here, not only at sign-in: without this, navigating straight to
  // a platform URL after the login redirect reaches a full session with no second factor.
  // Mirrors the sign-in rule (admins always; anyone flagged by an invite or a role change).
  if (user.mustSetUp2fa || (user.role === "ADMIN" && !user.twoFactorEnabled)) {
    redirect("/setup-2fa");
  }

  const navUser = {
    id: user.id,
    can: (action: string, resource?: object) => canFromUser(user, action, resource),
  };
  const modules = await getEnabledModules();
  const navigation = await getNavigation(navUser, { modules });
  const groups = buildGroups(modules, navigation);
  const flatNav = flattenNavigation(groups);
  const [notifPage, unread, outreachPaused] = await Promise.all([
    listForUser(user.id, { limit: 10 }),
    unreadCount(user.id),
    // The global outreach kill switch (COMP-3); default false if the setting isn't readable.
    getSetting<boolean>("acquisition.outreach.globalPause").catch(() => false),
  ]);
  const notifications = notifPage.items.map(toShellNotification);

  const clientUser: ShellUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    serviceLines: user.serviceLines,
    timezone: user.timezone,
  };

  async function markAllReadAction() {
    "use server";
    const current = await getCurrentUser();
    if (current === null) return;
    await markRead(current.id, "all");
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh bg-background text-foreground">
        <Sidebar navigation={groups} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={clientUser}
            notifications={notifications}
            unread={unread}
            navigate={flatNav}
            markAllReadAction={markAllReadAction}
          />
          <OutreachPausedBanner paused={outreachPaused} />
          <InstallAppBanner />
          <main className="flex-1 pb-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
          {/* Inside the layout column (not a fixed overlay) so it can never outgrow the screen;
              it sticks to the viewport bottom and takes real layout space below `main`. */}
          <MobileNav navigation={groups} />
        </div>
      </div>
    </TooltipProvider>
  );
}

function buildGroups(
  modules: readonly ModuleManifest[],
  navigation: { module: string; items: NavItem[] }[],
): NavigationGroup[] {
  const byId = new Map(modules.map((module) => [module.id, module]));
  return navigation.map(({ module, items }) => {
    const manifest = byId.get(module);
    return {
      module,
      moduleLabel: manifest?.name ?? module,
      moduleIcon: manifest?.icon ?? "LayoutGrid",
      items: items.map(toEntry),
    };
  });
}

function toEntry(item: NavItem): NavigationEntry {
  const entry: NavigationEntry = { id: item.id, label: item.label, href: item.href };
  if (item.icon !== undefined) entry.icon = item.icon;
  if (item.children !== undefined) entry.children = item.children.map(toEntry);
  return entry;
}

function flattenNavigation(
  groups: NavigationGroup[],
): { id: string; label: string; href: string; module: string }[] {
  const flat: { id: string; label: string; href: string; module: string }[] = [];
  for (const group of groups) walk(group.items, group.moduleLabel);
  return flat;
  function walk(items: NavigationEntry[], moduleLabel: string): void {
    for (const item of items) {
      flat.push({ id: item.id, label: item.label, href: item.href, module: moduleLabel });
      if (item.children !== undefined) walk(item.children, moduleLabel);
    }
  }
}

function toShellNotification(item: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): ShellNotification {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    link: item.link,
    readAt: item.readAt === null ? null : item.readAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}
