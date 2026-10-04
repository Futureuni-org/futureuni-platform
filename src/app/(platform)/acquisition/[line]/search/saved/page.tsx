import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import { listSavedSearches } from "@/modules/acquisition/sourcing";
import { getThrottleStatus } from "@/modules/acquisition/scoring";
import { SearchSpecSchema } from "@/contracts/source-adapter";
import type { Market } from "@/contracts/common";
import { resolveLine } from "@/modules/acquisition/ui/shell";
import { SavedSearchesClient, type SavedSearchDTO } from "@/modules/acquisition/ui/search/saved-searches-client";
import { specToDraft, type SourceOption } from "@/modules/acquisition/ui/search/types";
import { listAdapters } from "@/modules/acquisition/sourcing";

export const metadata: Metadata = { title: "Saved searches" };

const SCHEDULE_LABELS: Record<string, string> = {
  "0 9 * * *": "Every day at 09:00",
  "0 9 * * 1-5": "Weekdays at 09:00",
  "0 */6 * * *": "Every 6 hours",
  "0 9 * * 1": "Every Monday at 09:00",
};

export default async function SavedSearchesPage({
  params,
}: {
  params: Promise<{ line: string }>;
}): Promise<React.ReactElement> {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.search.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to saved searches"
        description="You can only view service lines you work on."
      />
    );
  }
  const canManage = canFromUser(user, "acquisition.savedSearch.manage", { serviceLine: ctx.line });

  const [saved, throttles] = await Promise.all([
    listSavedSearches({ serviceLine: ctx.line }).catch(() => []),
    getThrottleStatus().catch(() => []),
  ]);
  const lineAtCapacity = throttles.find((t) => t.line === ctx.line)?.mode === "PAUSED";

  const sourceOptions: SourceOption[] = listAdapters()
    .filter((a) => a.supportedServiceLines.includes(ctx.line))
    .map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      markets: a.markets,
      status: a.status,
      disabledReason: a.disabledReason ?? null,
      costPerCallMicros: a.costPerCallMicros,
    }));

  const rows: SavedSearchDTO[] = saved.map((s) => {
    const parsed = SearchSpecSchema.safeParse(s.spec);
    const draft = parsed.success
      ? specToDraft({
          markets: parsed.data.markets,
          locations: parsed.data.locations,
          keywords: parsed.data.keywords,
          sources: parsed.data.sources ?? [],
          limit: parsed.data.limit,
        })
      : { market: "NIGERIA" as const, ngLocation: "", intlLocation: "", keywords: [], sources: [], limit: 50 };
    return {
      id: s.id,
      name: s.name,
      cron: s.cron,
      timezone: s.timezone,
      scheduleLabel: SCHEDULE_LABELS[s.cron] ?? `Custom (${s.cron})`,
      specSummary: parsed.success
        ? summarise(parsed.data.markets, parsed.data.locations.map((l) => l.text), parsed.data.keywords)
        : "—",
      enabled: s.enabled,
      pausedReason: s.pausedReason,
      skippedAtCapacity: s.enabled && lineAtCapacity,
      ownerId: s.ownerId,
      nextRunAt: s.nextRunAt?.toISOString() ?? null,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      draft,
    };
  });

  const owners = [{ id: user.id, name: user.name }];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={ctx.label}
        title="Saved searches"
        description="Searches that run on a schedule and drop new leads into Review."
      />
      <SavedSearchesClient
        slug={slug}
        line={ctx.line}
        rows={rows}
        sourceOptions={sourceOptions}
        owners={owners}
        canManage={canManage}
        timezone={user.timezone}
      />
    </div>
  );
}

function summarise(markets: Market[], locations: string[], keywords: string[]): string {
  const marketLabel = markets.length === 2 ? "Both markets" : markets[0] === "NIGERIA" ? "Nigeria" : "International";
  const parts = [marketLabel];
  if (locations.length > 0) parts.push(locations.join(", "));
  if (keywords.length > 0) {
    const head = keywords.slice(0, 2).join(", ");
    parts.push(keywords.length > 2 ? `${head} (+${String(keywords.length - 2)})` : head);
  }
  return parts.join(" · ");
}
