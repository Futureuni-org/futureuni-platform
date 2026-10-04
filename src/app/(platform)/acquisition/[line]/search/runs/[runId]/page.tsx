import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { MarketBadge } from "@/components/ui/market-badge";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { getSearchRun } from "@/modules/acquisition/sourcing";
import { SearchSpecSchema } from "@/contracts/source-adapter";
import { resolveLine, lineHref } from "@/modules/acquisition/ui/shell";
import { RunPanel } from "@/modules/acquisition/ui/search/run-panel";

export const metadata: Metadata = { title: "Search run" };

const usd = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default async function RunPage({
  params,
}: {
  params: Promise<{ line: string; runId: string }>;
}): Promise<React.ReactElement> {
  const { line: slug, runId } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.search.read", { serviceLine: ctx.line })) {
    return <PermissionState title="No access" description="You can only view runs on your service lines." />;
  }

  const detail = await getSearchRun(actorOf(user), runId).catch(() => null);
  if (detail === null) notFound();

  const run = detail.run;
  const parsed = SearchSpecSchema.safeParse(run.spec);
  const canRun = canFromUser(user, "acquisition.search.run", { serviceLine: ctx.line });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={ctx.label}
        title="Search run"
        description="The spec, per-source results and the leads this run created."
        breadcrumbs={
          <Link href={lineHref(ctx.line, "search")} className="text-sm text-muted hover:text-foreground">
            ← Back to search
          </Link>
        }
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg bg-surface p-5 shadow-soft sm:grid-cols-4">
        <Detail label="Markets">
          <span className="flex flex-wrap gap-1">
            {run.markets.map((m) => (
              <MarketBadge key={m} market={m} />
            ))}
          </span>
        </Detail>
        <Detail label="Locations">
          {parsed.success && parsed.data.locations.length > 0
            ? parsed.data.locations.map((l) => l.text).join(", ")
            : "—"}
        </Detail>
        <Detail label="Keywords">
          {parsed.success && parsed.data.keywords.length > 0 ? parsed.data.keywords.join(", ") : "—"}
        </Detail>
        <Detail label="Limit">
          <span className="font-mono tabular-nums">{parsed.success ? parsed.data.limit : "—"}</span>
        </Detail>
        <Detail label="Cost (actual)">
          <span className="font-mono tabular-nums">{usd.format(run.costMicros / 1_000_000)}</span>
        </Detail>
        {run.estimatedCostMicros !== null ? (
          <Detail label="Cost (estimated)">
            <span className="font-mono tabular-nums">{usd.format(run.estimatedCostMicros / 1_000_000)}</span>
          </Detail>
        ) : null}
      </dl>

      <RunPanel slug={slug} line={ctx.line} initialRunId={runId} initialJobRunId={null} canRun={canRun} />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}
