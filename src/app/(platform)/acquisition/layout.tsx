import type { ReactNode } from "react";

import { canFromUser, requireUser } from "@/platform/auth";
import type { ServiceLine } from "@/contracts/common";
import {
  LINE_SLUGS,
  SECTIONS,
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

  const commands = buildCommands(user, visibleLines);

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

function buildCommands(
  user: Awaited<ReturnType<typeof requireUser>>,
  visibleLines: ServiceLine[],
): ShellCommand[] {
  const commands: ShellCommand[] = [];
  for (const line of visibleLines) {
    const label = lineLabel(line);
    for (const section of SECTIONS) {
      if (!canFromUser(user, section.action, { serviceLine: line })) continue;
      commands.push({
        id: `acq-nav-${LINE_SLUGS[line]}-${section.segment}`,
        label: `Go to ${label} › ${section.label}`,
        group: "Navigate",
        href: lineHref(line, section.segment),
      });
    }
    if (canFromUser(user, "acquisition.search.read", { serviceLine: line })) {
      commands.push({
        id: `acq-search-${LINE_SLUGS[line]}`,
        label: `Run a search in ${label}`,
        group: "Actions",
        href: lineHref(line, "search"),
      });
    }
    if (canFromUser(user, "acquisition.review.read", { serviceLine: line })) {
      commands.push({
        id: `acq-review-${LINE_SLUGS[line]}`,
        label: `Open review queue · ${label}`,
        group: "Actions",
        href: lineHref(line, "review"),
      });
    }
  }
  return commands;
}
