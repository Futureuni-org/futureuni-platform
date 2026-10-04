import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import { getActiveProfile } from "@/modules/acquisition/profiles";
import { getThrottleStatus } from "@/modules/acquisition/scoring";
import {
  SECTIONS,
  resolveLine,
  lineHref,
  CapacityBanner,
  SectionNav,
  type SectionNavItem,
} from "@/modules/acquisition/ui/shell";

/**
 * A service line's frame: a subtle line identity (accent + the profile's one-line description), a
 * capacity banner when the line is SLOW or PAUSED, and the section navigation with live badges.
 */

export default async function LineLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ line: string }>;
}): Promise<React.ReactElement> {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.lead.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to this line"
        description="You can only open service lines you work on. Pick one of your lines from the tabs above."
      />
    );
  }

  const items: SectionNavItem[] = SECTIONS.filter((s) =>
    canFromUser(user, s.action, { serviceLine: ctx.line }),
  ).map((s) => ({
    segment: s.segment,
    label: s.label,
    href: lineHref(ctx.line, s.segment),
    ...(s.badge === undefined ? {} : { badge: s.badge }),
  }));

  const [profile, throttles] = await Promise.all([
    getActiveProfile(ctx.line).catch(() => null),
    getThrottleStatus().catch(() => []),
  ]);
  const throttle = throttles.find((t) => t.line === ctx.line) ?? null;

  const isPrivileged = user.role === "ADMIN" || user.role === "MANAGER";
  const capacityHref = isPrivileged
    ? "/admin/team"
    : lineHref(ctx.line, "settings", { section: "overview" });
  const capacityLinkLabel = isPrivileged ? "View team capacity" : "View line capacity";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {profile?.description !== undefined && profile.description.length > 0 ? (
        <div
          className="flex items-center gap-3 border-l-2 pl-3"
          style={{ ["--line-accent" as string]: `var(--${ctx.accentToken})`, borderColor: "var(--line-accent)" }}
        >
          <p className="text-sm text-muted">{profile.description}</p>
        </div>
      ) : null}

      {throttle !== null && (throttle.mode === "SLOW" || throttle.mode === "PAUSED") ? (
        <CapacityBanner
          mode={throttle.mode}
          lineLabel={ctx.label}
          href={capacityHref}
          linkLabel={capacityLinkLabel}
        />
      ) : null}

      <SectionNav slug={slug} items={items} />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
