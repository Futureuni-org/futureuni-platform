import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { PageHeader } from "@/components/patterns/page-header";
import { auth, requireUser } from "@/platform/auth";
import { getSetting } from "@/platform/settings";
import { getPreferences, listNotificationTypes } from "@/platform/notifications";
import { cn } from "@/lib/cn";

import { ProfileSection } from "./_components/profile-section";
import { AppearanceSection } from "./_components/appearance-section";
import { NotificationsSection, type NotificationTypeRow } from "./_components/notifications-section";
import { SecuritySection } from "./_components/security-section";
import { SessionsList, type SessionRow } from "./_components/sessions-list";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { key: "profile", label: "Profile" },
  { key: "notifications", label: "Notifications" },
  { key: "appearance", label: "Appearance" },
  { key: "security", label: "Security" },
];

function deviceLabel(ua: string | null): string {
  if (ua === null || ua === "") return "Unknown device";
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg/i.test(ua)
    ? "Edge"
    : /Chrome/i.test(ua)
      ? "Chrome"
      : /Firefox/i.test(ua)
        ? "Firefox"
        : /Safari/i.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} on ${mobile ? "mobile" : "desktop"}`;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const sectionParam = typeof sp.section === "string" ? sp.section : "profile";
  const section = SECTIONS.some((s) => s.key === sectionParam) ? sectionParam : "profile";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="You" title="Settings" description="Your profile, notifications, appearance and security." />

      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={`/settings?section=${s.key}`}
            aria-current={section === s.key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md px-3 py-2 text-sm transition-colors",
              section === s.key
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {section === "profile" && (
        <ProfileSection
          email={user.email}
          initialName={user.name}
          initialTimezone={user.timezone}
          initialImage={user.image}
        />
      )}

      {section === "notifications" && <NotificationsPanel userId={user.id} />}

      {section === "appearance" && <AppearancePanel userId={user.id} />}

      {section === "security" && (
        <div className="flex flex-col gap-10">
          <SecuritySection twoFactorEnabled={user.twoFactorEnabled} isAdmin={user.role === "ADMIN"} />
          <SessionsPanel timezone={user.timezone} />
        </div>
      )}
    </div>
  );
}

async function NotificationsPanel({ userId }: { userId: string }) {
  const [types, prefs] = await Promise.all([
    Promise.resolve(listNotificationTypes()),
    getPreferences(userId),
  ]);
  const rows: NotificationTypeRow[] = types.map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    category: t.category,
    critical: t.critical,
  }));
  return <NotificationsSection types={rows} initialPrefs={prefs} />;
}

async function AppearancePanel({ userId }: { userId: string }) {
  const [density, reducedMotion] = await Promise.all([
    getSetting<"comfortable" | "compact">("user.density", { userId }),
    getSetting<boolean>("user.reducedMotion", { userId }),
  ]);
  return <AppearanceSection initialDensity={density} initialReducedMotion={reducedMotion} />;
}

async function SessionsPanel({ timezone }: { timezone: string }) {
  const h = await headers();
  const [raw, session] = await Promise.all([
    auth.api.listSessions({ headers: h }),
    auth.api.getSession({ headers: h }),
  ]);
  const currentToken = session?.session.token ?? null;
  const sessions: SessionRow[] = (raw as unknown as RawSession[]).map((s) => ({
    token: s.token,
    device: deviceLabel(s.userAgent ?? null),
    ip: s.ipAddress ?? null,
    lastActive: new Date(s.updatedAt).toISOString(),
    current: s.token === currentToken,
  }));
  // Current session first.
  sessions.sort((a, b) => (a.current === b.current ? 0 : a.current ? -1 : 1));
  return <SessionsList sessions={sessions} timezone={timezone} />;
}

interface RawSession {
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  updatedAt: Date | string;
}
