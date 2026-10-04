/**
 * Overview tab (Phase 17; R-A2, US-39). The four service lines compared side by side, with cross-
 * sell, capacity and throttle, market split, AI spend and a deliverability snapshot. Read-only: no
 * search, draft or approve actions. Managers and admins see every line; other roles see only their
 * own (`acquisition.overview.read`, LINES scope). Links into `/admin/*` show for admins only.
 */

import Link from "next/link";
import type { Metadata } from "next";

import type { Currency, Market, ServiceLine } from "@/contracts/common";
import { AdminTable, type AdminColumn } from "@/components/admin";
import { PageHeader, PermissionState, Section } from "@/components/patterns";
import { Money, ServiceLineBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import {
  getOverview,
  resolveRange,
  type OverviewResult,
  type RangePreset,
} from "@/modules/acquisition/analytics";
import { ComparisonBars, formatCostUsd, formatPercent, type ComparisonRow } from "@/modules/acquisition/ui/analytics";

export const metadata: Metadata = { title: "Overview · Acquisition" };

const ALL_LINES: ServiceLine[] = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"];
const LINE_LABELS: Record<ServiceLine, string> = {
  WEB_DEVELOPMENT: "Web Development",
  UI_UX_DESIGN: "UI/UX Design",
  GRAPHIC_DESIGN: "Graphic Design",
  VIDEO_EDITING: "Video Editing",
};
const THROTTLE_META: Record<
  "NORMAL" | "SLOW" | "PAUSED",
  { label: string; dot: string; text: string }
> = {
  NORMAL: { label: "Normal", dot: "bg-success", text: "text-success" },
  SLOW: { label: "Slow", dot: "bg-warning", text: "text-warning" },
  PAUSED: { label: "Paused", dot: "bg-danger", text: "text-danger" },
};

/** Throttle mode as a dot plus word, so meaning never rests on colour alone (project-rules). */
function ThrottleBadge({ mode }: { mode: "NORMAL" | "SLOW" | "PAUSED" }) {
  const meta = THROTTLE_META[mode];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span aria-hidden className={cn("size-2 rounded-full", meta.dot)} />
      <span className={meta.text}>{meta.label}</span>
    </span>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const RANGE_PRESETS = new Set<RangePreset>(["7d", "30d", "90d", "qtd", "ytd", "custom"]);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);

  const lines = ALL_LINES.filter((line) => canFromUser(user, "acquisition.overview.read", { serviceLine: line }));
  if (lines.length === 0) {
    return <PermissionState description="You don't have access to the acquisition overview." />;
  }
  const isAdmin = canFromUser(user, "platform.admin.access");

  const rawRange = one(sp.range);
  const preset: RangePreset = rawRange !== undefined && RANGE_PRESETS.has(rawRange as RangePreset) ? (rawRange as RangePreset) : "30d";
  const range = resolveRange({ preset }, new Date());
  const marketParam = one(sp.market);
  const market: Market | undefined = marketParam === "NIGERIA" || marketParam === "INTERNATIONAL" ? marketParam : undefined;

  const overview = await getOverview(actorOf(user), {
    lines,
    ...(market === undefined ? {} : { market }),
    from: range.from,
    to: range.to,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Overview"
        title="Acquisition overview"
        description="Every service line side by side: what's converting, where capacity is tight, cross-sell in play, and what the pipeline is worth."
      />
      <LineComparison overview={overview} />
      <CapacitySection overview={overview} isAdmin={isAdmin} />
      <CrossSellSection overview={overview} />
      <MarketSplitSection overview={overview} />
      <AiSpendSection overview={overview} isAdmin={isAdmin} />
      <DeliverabilitySection overview={overview} isAdmin={isAdmin} />
    </div>
  );
}

function comparisonRows(overview: OverviewResult, pick: (l: OverviewResult["lines"][number]) => { value: number | null; display: string }): ComparisonRow[] {
  return overview.lines.map((l) => ({ serviceLine: l.serviceLine, label: LINE_LABELS[l.serviceLine], ...pick(l) }));
}

function LineComparison({ overview }: { overview: OverviewResult }) {
  return (
    <Section title="Lines compared" description="The headline metrics for each service line.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ComparisonBars
          title="Leads found"
          summary="Leads created per line in this range."
          rows={comparisonRows(overview, (l) => ({ value: l.leadsFound, display: String(l.leadsFound) }))}
        />
        <ComparisonBars
          title="Reply rate"
          summary="Reply rate per line in this range."
          rows={comparisonRows(overview, (l) => ({ value: l.replyRate, display: l.replyRate === null ? "—" : formatPercent(l.replyRate) }))}
        />
        <ComparisonBars
          title="Meetings booked"
          summary="Meetings booked per line in this range."
          rows={comparisonRows(overview, (l) => ({ value: l.meetingsBooked, display: String(l.meetingsBooked) }))}
        />
        <ComparisonBars
          title="Won"
          summary="Deals won per line in this range."
          rows={comparisonRows(overview, (l) => ({ value: l.won, display: String(l.won) }))}
        />
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 pr-3 font-medium">Line</th>
              <th className="pb-2 pr-3 text-right font-medium">Revenue (per currency)</th>
              <th className="pb-2 text-right font-medium">AI cost per won</th>
            </tr>
          </thead>
          <tbody>
            {overview.lines.map((l) => (
              <tr key={l.serviceLine} className="border-t border-border/60">
                <td className="py-2 pr-3">
                  <ServiceLineBadge line={l.serviceLine} />
                </td>
                <td className="py-2 pr-3 text-right">
                  {l.revenue.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="flex flex-wrap justify-end gap-x-2">
                      {l.revenue.map((r) => (
                        <Money key={r.currency} value={{ amountMinor: r.revenueMinor, currency: r.currency }} compact />
                      ))}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-foreground">
                  {formatCostUsd(l.aiCostPerWonDealMicros)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function CapacitySection({ overview, isAdmin }: { overview: OverviewResult; isAdmin: boolean }) {
  return (
    <Section
      title="Capacity and throttle"
      description="Each line's sending mode, team load against capacity, and leads held in nurture."
      actions={isAdmin ? <Link href="/admin/team" className="text-sm text-primary hover:underline">Manage team</Link> : undefined}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 pr-3 font-medium">Line</th>
            <th className="pb-2 pr-3 font-medium">Mode</th>
            <th className="pb-2 pr-3 text-right font-medium">Load / capacity</th>
            <th className="pb-2 text-right font-medium">Held in nurture</th>
          </tr>
        </thead>
        <tbody>
          {overview.lines.map((l) => (
            <tr key={l.serviceLine} className="border-t border-border/60">
              <td className="py-2 pr-3">
                <ServiceLineBadge line={l.serviceLine} />
              </td>
              <td className="py-2 pr-3">
                <ThrottleBadge mode={l.throttleMode} />
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">
                {l.load} / {l.capacity}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-muted">{l.nurtureHeld}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

interface CrossSellRow {
  groupId: string;
  companyName: string;
  lines: ServiceLine[];
  leadingLine: ServiceLine | null;
  status: string;
  estimatedValue: { currency: Currency; amountMinor: number }[];
}

function CrossSellSection({ overview }: { overview: OverviewResult }) {
  const columns: AdminColumn<CrossSellRow>[] = [
    { key: "company", header: "Company", cell: (r) => <span className="font-medium text-foreground">{r.companyName}</span> },
    {
      key: "lines",
      header: "Lines",
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.lines.map((line) => (
            <ServiceLineBadge key={line} line={line} />
          ))}
        </span>
      ),
    },
    { key: "leading", header: "Leading", cell: (r) => (r.leadingLine === null ? "—" : LINE_LABELS[r.leadingLine]) },
    { key: "status", header: "Status", cell: (r) => r.status },
    {
      key: "value",
      header: "Est. value",
      align: "right",
      cell: (r) =>
        r.estimatedValue.length === 0 ? (
          "—"
        ) : (
          <span className="flex flex-wrap justify-end gap-x-2">
            {r.estimatedValue.map((v) => (
              <Money key={v.currency} value={{ amountMinor: v.amountMinor, currency: v.currency }} compact />
            ))}
          </span>
        ),
    },
  ];
  const rows: CrossSellRow[] = overview.crossSell.map((g) => ({
    groupId: g.groupId,
    companyName: g.companyName,
    lines: g.lines,
    leadingLine: g.leadingLine,
    status: g.status,
    estimatedValue: g.estimatedValue,
  }));
  return (
    <Section title="Cross-sell opportunities" description="Companies in play for more than one line.">
      <AdminTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.groupId}
        caption="Cross-sell opportunities: companies in play for more than one service line."
        empty={<p className="text-sm text-muted">No active cross-sell groups in this range.</p>}
      />
    </Section>
  );
}

function MarketSplitSection({ overview }: { overview: OverviewResult }) {
  return (
    <Section title="Market split" description="Nigeria versus International across all lines.">
      <table className="w-full max-w-md text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 pr-3 font-medium">Market</th>
            <th className="pb-2 pr-3 text-right font-medium">Leads</th>
            <th className="pb-2 pr-3 text-right font-medium">Reply rate</th>
            <th className="pb-2 text-right font-medium">Won</th>
          </tr>
        </thead>
        <tbody>
          {overview.marketSplit.map((m) => (
            <tr key={m.market} className="border-t border-border/60">
              <td className="py-2 pr-3 text-foreground">{m.market === "NIGERIA" ? "Nigeria" : "International"}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">{m.leadsFound}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">
                {m.replyRate === null ? "—" : formatPercent(m.replyRate)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-foreground">{m.won}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function AiSpendSection({ overview, isAdmin }: { overview: OverviewResult; isAdmin: boolean }) {
  return (
    <Section
      title="AI spend"
      description="Model spend this period, by line."
      actions={isAdmin ? <Link href="/admin/ai-usage" className="text-sm text-primary hover:underline">AI usage and budget</Link> : undefined}
    >
      <ComparisonBars
        title="AI spend by line"
        summary="AI model cost per line in this range, in US dollars."
        rows={overview.ai.byLine.map((a) => ({
          serviceLine: a.serviceLine,
          label: LINE_LABELS[a.serviceLine],
          value: a.costMicros,
          display: formatCostUsd(a.costMicros),
        }))}
      />
    </Section>
  );
}

function DeliverabilitySection({ overview, isAdmin }: { overview: OverviewResult; isAdmin: boolean }) {
  const d = overview.deliverability;
  return (
    <Section
      title="Deliverability"
      description="Mailbox health across the team."
      actions={isAdmin ? <Link href="/admin/mailboxes" className="text-sm text-primary hover:underline">Mailboxes</Link> : undefined}
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Active" value={String(d.activeMailboxes)} />
        <Stat label="Warming" value={String(d.warmingMailboxes)} />
        <Stat label="Paused" value={String(d.pausedMailboxes)} />
        <Stat label="Hard bounce rate" value={d.hardBounceRate === null ? "—" : formatPercent(d.hardBounceRate)} />
      </dl>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-xl tabular-nums text-heading">{value}</dd>
    </div>
  );
}
