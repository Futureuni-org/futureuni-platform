import type { ReactNode } from "react";

import { canFromUser, requireUser } from "@/platform/auth";
import { getCommands, getEnabledModules, mayOpen } from "@/platform/registry";
import type { ServiceLine } from "@/contracts/common";
import {
  LINE_SLUGS,
  lineAccentToken,
  lineHref,
  lineLabel,
  LineTabs,
  CommandRegistrar,
  type LineTab,
  type OverviewTab,
  type ShellCommand,
} from "@/modules/acquisition/ui/shell";

/**
 * The Client-Acquisition module frame: the module name and the service-line tab bar (four lines
 * plus Overview). Tabs the viewer can't reach are hidden; every screen below re-checks its own
 * permissions on the server. Command-palette navigation for the reachable lines and sections is
 * registered here.
 */

const LINE_ORDER = Object.keys(LINE_SLUGS) as ServiceLine[];

export default async function AcquisitionLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.ReactElement> {
  const user = await requireUser();

  const visibleLines = LINE_ORDER.filter((line) =>
    canFromUser(user, "acquisition.lead.read", { serviceLine: line }),
  );

  const tabs: LineTab[] = visibleLines.map((line) => ({
    slug: LINE_SLUGS[line],
    label: lineLabel(line),
    href: lineHref(line),
    accentToken: lineAccentToken(line),
  }));

  const showOverview =
    user.role === "ADMIN" || user.role === "MANAGER" || user.serviceLines.length > 0;
  const overview: OverviewTab | null = showOverview
    ? { label: "Overview", href: "/acquisition/overview" }
    : null;

  const commands = await buildCommands(user);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CommandRegistrar commands={commands} />
      <header className="flex flex-col gap-2 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Client Acquisition
        </p>
        <LineTabs lines={tabs} overview={overview} />
      </header>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The command-palette entries the viewer can reach, derived from the module manifest (the single
 * source, `src/modules/acquisition/manifest.ts`) and filtered by permission with `mayOpen`. A
 * disabled module contributes nothing (CR-02-21: `getCommands` is scoped to the enabled modules).
 */
async function buildCommands(
  user: Awaited<ReturnType<typeof requireUser>>,
): Promise<ShellCommand[]> {
  const modules = await getEnabledModules();
  const navUser = {
    id: user.id,
    can: (action: string, resource?: object): boolean => canFromUser(user, action, resource),
  };
  return getCommands(modules).flatMap((command): ShellCommand[] => {
    if (command.module !== "acquisition" || command.href === undefined) return [];
    if (command.permission !== undefined && !mayOpen(navUser, command.permission, command.resource)) {
      return [];
    }
    return [
      {
        id: command.id,
        label: command.label,
        group: command.group === "navigate" ? "Navigate" : "Actions",
        href: command.href,
      },
    ];
  });
}
