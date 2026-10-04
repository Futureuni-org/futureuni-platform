import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUp, Plus, CalendarClock } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Section } from "@/components/patterns/section";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { MarketBadge } from "@/components/ui/market-badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { AdminTable, FilterBar, UrlSelect, type AdminColumn } from "@/components/admin";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { getActiveProfile } from "@/modules/acquisition/profiles";
import { listAdapters, listSearchRuns } from "@/modules/acquisition/sourcing";
import { SearchSpecSchema, SearchRunCountsSchema } from "@/contracts/source-adapter";
import type { Market, ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { resolveLine, lineHref } from "@/modules/acquisition/ui/shell";
import { SearchWorkspace } from "@/modules/acquisition/ui/search/search-workspace";
import type { MarketMode, SearchDraft, SourceOption } from "@/modules/acquisition/ui/search/types";
import type { RunSummaryDTO } from "@/modules/acquisition/ui/search/view";

export const metadata: Metadata = { title: "Search" };

const GHOST_LINK =
  "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const SECONDARY_LINK =
  "inline-flex h-9 items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v === "" ? undefined : v;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.search.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to search"
        description="You can only search service lines you work on."
      />
    );
  }

  const sp = await searchParams;
  const runParam = one(sp.run) ?? null;
  const statusFilter = one(sp.status);
  const marketFilter = one(sp.market);
  const whoFilter = one(sp.who);

  const canRun = canFromUser(user, "acquisition.search.run", { serviceLine: ctx.line });
  const canSave = canFromUser(user, "acquisition.savedSearch.manage", { serviceLine: ctx.line });
  const canManualAdd = canFromUser(user, "acquisition.lead.create", { serviceLine: ctx.line });

  const profile = await getActiveProfile(ctx.line).catch(() => null);
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

  const defaultMarket = toMarketMode(one(sp.market));
  const initialDraft = buildInitialDraft(profile, sourceOptions, defaultMarket);

  const runs = await listSearchRuns(actorOf(user), { serviceLine: ctx.line, limit: 50 }).catch(() => ({
    items: [],
    nextCursor: null,
  }));
  const summaries = runs.items
    .map((run) => toSummary(run))
    .filter((r) => (statusFilter === undefined ? true : r.status === statusFilter))
    .filter((r) => (marketFilter === undefined ? true : r.markets.includes(marketFilter as Market)))
    .filter((r) =>
      whoFilter === undefined
        ? true
        : whoFilter === "me"
          ? r.actorId === user.id
          : whoFilter === "system"
            ? r.actorId === null
            : true,
    );

  const owners = [{ id: user.id, name: user.name }];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={ctx.label}
        title="Search"
        description="Find businesses that need this line's service, then watch qualified leads arrive."
        actions={
          <div className="flex flex-wrap gap-2">
            {canSave ? (
              <Link href={lineHref(ctx.line, "search/saved")} className={GHOST_LINK}>
                <CalendarClock className="size-4" aria-hidden />
                Saved searches
              </Link>
            ) : null}
            {canFromUser(user, "acquisition.import.run", { serviceLine: ctx.line }) ? (
              <Link href={lineHref(ctx.line, "search/import")} className={GHOST_LINK}>
                <FileUp className="size-4" aria-hidden />
                Import CSV
              </Link>
            ) : null}
            {canManualAdd ? (
              <Link href={lineHref(ctx.line, "search", { add: "1" })} className={SECONDARY_LINK}>
                <Plus className="size-4" aria-hidden />
                Add lead
              </Link>
            ) : null}
          </div>
        }
      />

      <SearchWorkspace
        slug={slug}
        line={ctx.line}
        canRun={canRun}
        canSave={canSave}
        canManualAdd={canManualAdd}
        sourceOptions={sourceOptions}
        initialDraft={initialDraft}
        owners={owners}
        initialRunId={runParam}
      />

      <Section eyebrow="History" title="Recent runs">
        <FilterBar>
          <UrlSelect
            paramKey="status"
            label="Status"
            options={[
              { value: "RUNNING", label: "Running" },
              { value: "SUCCEEDED", label: "Succeeded" },
              { value: "PARTIAL", label: "Partial" },
              { value: "FAILED", label: "Failed" },
              { value: "SKIPPED", label: "Skipped" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
          <UrlSelect
            paramKey="market"
            label="Market"
            options={[
              { value: "NIGERIA", label: "Nigeria" },
              { value: "INTERNATIONAL", label: "International" },
            ]}
          />
          <UrlSelect
            paramKey="who"
            label="Who"
            options={[
              { value: "me", label: "Me" },
              { value: "system", label: "Scheduled" },
            ]}
          />
        </FilterBar>
        <RunsTable rows={summaries} line={ctx.line} userId={user.id} timezone={user.timezone} />
      </Section>
    </div>
  );
}

function RunsTable({
  rows,
  line,
  userId,
  timezone,
}: {
  rows: RunSummaryDTO[];
  line: ServiceLine;
  userId: string;
  timezone: string;
}): React.ReactElement {
  const columns: AdminColumn<RunSummaryDTO>[] = [
    {
      key: "when",
      header: "When",
      cell: (r) => <RelativeTime value={new Date(r.createdAt)} timezone={timezone} />,
    },
    { key: "status", header: "Status", cell: (r) => <RunStatusText status={r.status} /> },
    {
      key: "market",
      header: "Market",
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.markets.map((m) => (
            <MarketBadge key={m} market={m} />
          ))}
        </span>
      ),
    },
    { key: "location", header: "Location", cell: (r) => (r.locations.length > 0 ? r.locations.join(", ") : "—") },
    {
      key: "leads",
      header: "Leads",
      align: "right",
      className: "font-mono tabular-nums",
      cell: (r) => String(r.counts?.leadsCreated ?? 0),
    },
    { key: "who", header: "Who", cell: (r) => (r.actorId === null ? "Scheduled" : r.actorId === userId ? "You" : "Teammate") },
    {
      key: "open",
      header: "",
      align: "right",
      cell: (r) => (
        <Link
          href={lineHref(line, `search/runs/${r.id}`)}
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          View
        </Link>
      ),
    },
  ];
  return (
    <AdminTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      caption="Recent search runs"
      empty={<EmptyState title="No runs yet" description="Run your first search above to see it here." />}
    />
  );
}

const RUN_STATUS_TEXT: Record<RunSummaryDTO["status"], string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  PARTIAL: "Partial",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  SKIPPED: "Skipped",
};

function RunStatusText({ status }: { status: RunSummaryDTO["status"] }): React.ReactElement {
  return <span className="text-sm">{RUN_STATUS_TEXT[status]}</span>;
}

// --- server-side mapping helpers (not shipped to the client) --------------------------------

function toSummary(run: {
  id: string;
  serviceLine: ServiceLine;
  status: RunSummaryDTO["status"];
  trigger: string;
  markets: Market[];
  spec: unknown;
  counts: unknown;
  costMicros: number;
  estimatedCostMicros: number | null;
  skipReason: string | null;
  error: string | null;
  actorId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  jobRunId: string | null;
}): RunSummaryDTO {
  const parsedSpec = SearchSpecSchema.safeParse(run.spec);
  const parsedCounts = SearchRunCountsSchema.safeParse(run.counts);
  return {
    id: run.id,
    serviceLine: run.serviceLine,
    status: run.status,
    trigger: run.trigger,
    markets: run.markets,
    locations: parsedSpec.success ? parsedSpec.data.locations.map((l) => l.text) : [],
    keywords: parsedSpec.success ? parsedSpec.data.keywords : [],
    sources: parsedSpec.success ? (parsedSpec.data.sources ?? []) : [],
    counts: parsedCounts.success ? parsedCounts.data : null,
    costMicros: run.costMicros,
    estimatedCostMicros: run.estimatedCostMicros,
    skipReason: run.skipReason,
    error: run.error,
    actorId: run.actorId,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    jobRunId: run.jobRunId,
  };
}

function toMarketMode(raw: string | undefined): MarketMode {
  if (raw === "INTERNATIONAL" || raw === "BOTH") return raw;
  return "NIGERIA";
}

function buildInitialDraft(
  profile: ServiceLineProfile | null,
  sourceOptions: SourceOption[],
  market: MarketMode,
): SearchDraft {
  const markets: Market[] = market === "BOTH" ? ["NIGERIA", "INTERNATIONAL"] : [market];
  const keywords = profile === null ? [] : deriveKeywords(profile, markets);
  const sources =
    profile === null
      ? sourceOptions.filter((s) => s.status === "ENABLED" && s.markets.some((m) => markets.includes(m))).map((s) => s.id)
      : profile.sources
          .filter((s) => s.enabled && s.markets.some((m) => markets.includes(m)))
          .map((s) => s.adapterId)
          .filter((id) => sourceOptions.some((o) => o.id === id && o.status === "ENABLED"));
  return {
    market,
    ngLocation: "",
    intlLocation: "",
    keywords: keywords.slice(0, 8),
    sources,
    limit: 50,
  };
}

// Params that describe locations, not search keywords — excluded from the keyword seed.
const LOCATION_PARAM_KEYS = new Set([
  "cities",
  "city",
  "location",
  "locations",
  "region",
  "regions",
  "country",
  "countries",
]);

function deriveKeywords(profile: ServiceLineProfile, markets: Market[]): string[] {
  const found = new Set<string>();
  for (const source of profile.sources) {
    for (const market of markets) {
      const params = source.defaultParams[market];
      if (params === undefined) continue;
      for (const [key, value] of Object.entries(params)) {
        if (LOCATION_PARAM_KEYS.has(key.toLowerCase())) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === "string" && item.length >= 2) found.add(item);
          }
        }
      }
    }
  }
  return [...found];
}
