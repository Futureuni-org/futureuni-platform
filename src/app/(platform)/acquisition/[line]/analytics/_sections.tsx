/**
 * Server sections for the line analytics page (Phase 17). Each heavy section is an async server
 * component so the page can stream it behind Suspense (B3.7). Sections fetch through the analytics
 * services (which authorise and cache) and pass plain props to the client chart components.
 */

import "server-only";

import type { Actor, ServiceLine } from "@/contracts/common";
import { Sparkline } from "@/components/charts";
import { Section, StatRow, type Stat } from "@/components/patterns";
import { Money } from "@/components/ui";
import {
  getBreakdown,
  getCalibration,
  getEfficiency,
  getFunnel,
  getLossReasons,
  getReplyHeatmap,
  getResponsiveness,
  getTimeSeries,
  getMetric,
  type BreakdownDimension,
  type BreakdownResult,
  type LineAnalytics,
  type LineAnalyticsFilters,
  type MetricId,
} from "@/modules/acquisition/analytics";
import {
  ConversionBars,
  CsvExportButton,
  FunnelChart,
  HeatmapChart,
  InfoTooltip,
  TrendChart,
  deltaIsGood,
  formatByUnit,
  formatCostUsd,
  formatDelta,
  formatDuration,
  formatPercent,
  lineHref,
  type TrendSeriesOption,
} from "@/modules/acquisition/ui/analytics";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The query that carries the current range and market into a leads-list drill-down (M17-AC5). */
function drilldownQuery(filters: LineAnalyticsFilters, extra: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    from: isoDay(filters.from),
    to: isoDay(filters.to),
    ...(filters.market === undefined ? {} : { market: filters.market }),
  };
}

// ---- Headline row ----------------------------------------------------------

const HEADLINE_METRICS: MetricId[] = [
  "leads_found",
  "reply_rate",
  "meetings_booked",
  "won",
  "ai_cost_per_won_deal",
];

export function HeadlineRow({
  line,
  data,
}: {
  line: ServiceLine;
  data: LineAnalytics;
}) {
  const stats: Stat[] = HEADLINE_METRICS.map((id) => {
    const scalar = data.scalars[id];
    const metric = getMetric(id);
    const stat: Stat = {
      id,
      label: metric.label,
      value: formatByUnit(metric.unit, scalar?.value ?? null),
    };
    if (scalar !== undefined && scalar.delta !== null) {
      const good = deltaIsGood(scalar.delta, metric.higherIsBetter);
      stat.delta = { value: formatDelta(scalar.delta), ...(good === undefined ? {} : { good }) };
    }
    if (scalar !== undefined && scalar.sparkline.length > 0) {
      stat.sparkline = <Sparkline data={scalar.sparkline} serviceLine={line} ariaLabel={`${metric.label} trend`} />;
    }
    return stat;
  });

  // Revenue is per currency, so it gets its own tile rendered as side-by-side amounts.
  const revenueStat: Stat = {
    id: "revenue",
    label: "Revenue",
    value:
      data.revenue.length === 0 ? (
        "—"
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
          {data.revenue.map((r) => (
            <Money key={r.currency} value={{ amountMinor: r.revenueMinor, currency: r.currency }} compact />
          ))}
        </span>
      ),
  };
  stats.splice(4, 0, revenueStat);

  return <StatRow stats={stats} />;
}

// ---- Funnel ----------------------------------------------------------------

export async function FunnelSection({ actor, filters }: { actor: Actor; filters: LineAnalyticsFilters }) {
  const funnel = await getFunnel(actor, filters);
  const rows = funnel.stages.map((s) => [
    s.label,
    s.count,
    s.conversionFromPrevious === null ? "" : formatPercent(s.conversionFromPrevious),
  ]);
  return (
    <Section
      title="The funnel"
      description="Leads created in this period, followed from found to won."
      actions={
        <div className="flex items-center gap-1">
          <InfoTooltip label="Cohort funnel: of the leads created in the range, how many reached each stage." />
          <CsvExportButton filename="funnel" headers={["Stage", "Count", "Conversion"]} rows={rows} />
        </div>
      }
    >
      <FunnelChart data={funnel} showMarkets={filters.market === undefined} />
    </Section>
  );
}

// ---- Trends ----------------------------------------------------------------

const TREND_SERIES: TrendSeriesOption[] = [
  { key: "leads_found", label: "Leads found" },
  { key: "sent", label: "Sent" },
  { key: "reply_rate", label: "Replies" },
  { key: "meetings_booked", label: "Meetings" },
];

export async function TrendsSection({ actor, filters }: { actor: Actor; filters: LineAnalyticsFilters }) {
  const series = await getTimeSeries(actor, filters, "day");
  const points = series.points.map((p) => ({
    bucket: p.bucket,
    values: Object.fromEntries(TREND_SERIES.map((s) => [s.key, p.values[s.key as MetricId] ?? 0])),
  }));
  const rows = series.points.map((p) => [
    p.bucket,
    p.values.leads_found ?? 0,
    p.values.sent ?? 0,
    p.values.reply_rate ?? 0,
    p.values.meetings_booked ?? 0,
  ]);
  return (
    <Section
      title="Trends"
      actions={
        <div className="flex items-center gap-1">
          <InfoTooltip label="Daily counts of leads found, first touches sent, genuine replies and meetings booked." />
          <CsvExportButton filename="trends" headers={["Day", "Leads", "Sent", "Replies", "Meetings"]} rows={rows} />
        </div>
      }
    >
      <TrendChart points={points} series={TREND_SERIES} />
    </Section>
  );
}

// ---- What converts ---------------------------------------------------------

export async function WhatConvertsSection({ actor, filters, line }: { actor: Actor; filters: LineAnalyticsFilters; line: ServiceLine }) {
  const [bySignal, bySource, byAngle] = await Promise.all([
    getBreakdownSafe(actor, filters, "signal"),
    getBreakdownSafe(actor, filters, "source"),
    getBreakdownSafe(actor, filters, "pitchAngle"),
  ]);
  return (
    <Section
      title="What converts"
      description="Reply rate by signal, source and pitch angle. Click a bar to see those leads."
      variant="zone"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Labelled title="By signal">
          <ConversionBars
            data={bySignal}
            hrefFor={(row) =>
              row.key === "(none)" ? null : lineHref(line, "leads", drilldownQuery(filters, { signal: row.key }))
            }
          />
        </Labelled>
        <Labelled title="By source">
          <ConversionBars
            data={bySource}
            hrefFor={(row) => lineHref(line, "leads", drilldownQuery(filters, { source: row.key }))}
          />
        </Labelled>
        <Labelled title="By pitch angle">
          <ConversionBars data={byAngle} />
        </Labelled>
      </div>
    </Section>
  );
}

// ---- Markets ---------------------------------------------------------------

export async function MarketsSection({ actor, filters }: { actor: Actor; filters: LineAnalyticsFilters }) {
  const [byMarket, byCountry] = await Promise.all([
    getBreakdownSafe(actor, filters, "market"),
    getBreakdownSafe(actor, filters, "country"),
  ]);
  return (
    <Section title="Markets" description="Nigeria versus International, and International by country.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Labelled title="By market">
          <ConversionBars data={byMarket} />
        </Labelled>
        <Labelled title="By country">
          <ConversionBars data={byCountry} />
        </Labelled>
      </div>
    </Section>
  );
}

// ---- Responsiveness --------------------------------------------------------

export async function ResponsivenessSection({ actor, filters }: { actor: Actor; filters: LineAnalyticsFilters }) {
  const [heatmap, sla] = await Promise.all([getReplyHeatmap(actor, filters), getResponsiveness(actor, filters)]);
  const slaRows = sla.map((r) => [
    r.ownerName,
    r.actionable,
    r.met,
    r.slaMetRate === null ? "" : formatPercent(r.slaMetRate),
    formatDuration(r.medianFirstResponseMs),
  ]);
  return (
    <Section title="Responsiveness" description="When replies arrive, and how fast the team responds.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Labelled title="Reply heatmap (recipient local time)">
          <HeatmapChart data={heatmap} />
        </Labelled>
        <Labelled title="SLA by owner">
          {sla.length === 0 ? (
            <p className="text-sm text-muted">No actionable replies in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 pr-3 font-medium">Owner</th>
                  <th className="pb-2 pr-3 text-right font-medium">Met</th>
                  <th className="pb-2 pr-3 text-right font-medium">SLA rate</th>
                  <th className="pb-2 text-right font-medium">Median response</th>
                </tr>
              </thead>
              <tbody>
                {sla.map((r) => (
                  <tr key={r.ownerId} className="border-t border-border/60">
                    <td className="py-2 pr-3 text-foreground">{r.ownerName}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                      {r.met}/{r.actionable}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">
                      {r.slaMetRate === null ? "—" : formatPercent(r.slaMetRate)}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-foreground">
                      {formatDuration(r.medianFirstResponseMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="sr-only">
            <CsvExportButton
              filename="sla-by-owner"
              headers={["Owner", "Actionable", "Met", "SLA rate", "Median response"]}
              rows={slaRows}
            />
          </div>
        </Labelled>
      </div>
    </Section>
  );
}

// ---- Revenue ---------------------------------------------------------------

export async function RevenueSection({ actor, filters, data }: { actor: Actor; filters: LineAnalyticsFilters; data: LineAnalytics }) {
  const loss = await getLossReasons(actor, filters);
  const timeToClose = data.durations.time_to_close;
  const lossRows = loss.map((l) => [l.reason, l.count]);
  return (
    <Section title="Revenue" description="Won revenue per currency, deal size, time to close and why deals are lost.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Labelled title="Revenue and average deal (per currency)">
          {data.revenue.length === 0 ? (
            <p className="text-sm text-muted">No won deals in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 pr-3 font-medium">Currency</th>
                  <th className="pb-2 pr-3 text-right font-medium">Won</th>
                  <th className="pb-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Avg deal</th>
                </tr>
              </thead>
              <tbody>
                {data.revenue.map((r) => (
                  <tr key={r.currency} className="border-t border-border/60">
                    <td className="py-2 pr-3 text-foreground">{r.currency}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{r.wonCount}</td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={{ amountMinor: r.revenueMinor, currency: r.currency }} />
                    </td>
                    <td className="py-2 text-right">
                      <Money value={{ amountMinor: r.averageDealMinor, currency: r.currency }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-sm text-muted">
            Time to close: {formatDuration(timeToClose?.medianMs ?? null)} median,{" "}
            {formatDuration(timeToClose?.p75Ms ?? null)} at p75.
          </p>
        </Labelled>
        <Labelled title="Why deals are lost">
          {loss.length === 0 ? (
            <p className="text-sm text-muted">No lost deals in this range.</p>
          ) : (
            <ConversionBars
              data={{
                dimension: "market",
                metricId: "won",
                rows: loss.map((l) => ({
                  key: l.reason,
                  label: l.reason,
                  sampleSize: l.count,
                  numerator: l.count,
                  rate: null,
                  lowSample: false,
                })),
              }}
            />
          )}
          <div className="sr-only">
            <CsvExportButton filename="loss-reasons" headers={["Reason", "Count"]} rows={lossRows} />
          </div>
        </Labelled>
      </div>
    </Section>
  );
}

// ---- Efficiency ------------------------------------------------------------

export async function EfficiencySection({ actor, filters }: { actor: Actor; filters: LineAnalyticsFilters }) {
  const eff = await getEfficiency(actor, filters);
  const taskRows = eff.byTask.map((t) => [t.task, t.calls, formatCostUsd(t.costMicros)]);
  const sourceRows = eff.costPerSource.map((s) => [s.adapterId, s.leads, formatCostUsd(s.aiCostPerLeadMicros)]);
  return (
    <Section title="Efficiency" description="What leads cost, and where the AI budget goes.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Labelled title="AI cost per lead, by source">
          <ConversionBars
            data={{
              dimension: "source",
              metricId: "cost_per_lead",
              rows: eff.costPerSource.map((s) => ({
                key: s.adapterId,
                label: s.adapterId,
                sampleSize: s.leads,
                numerator: s.aiCostMicros,
                rate: s.aiCostPerLeadMicros === null ? null : s.aiCostPerLeadMicros / 1_000_000,
                lowSample: false,
              })),
            }}
          />
          <div className="sr-only">
            <CsvExportButton filename="cost-per-source" headers={["Source", "Leads", "AI cost per lead"]} rows={sourceRows} />
          </div>
        </Labelled>
        <Labelled title="AI cost by task (top 5)">
          <p className="mb-3 text-sm text-foreground">
            AI cost per won deal: <span className="font-mono">{formatCostUsd(eff.aiCostPerWonDealMicros)}</span>
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">Task</th>
                <th className="pb-2 pr-3 text-right font-medium">Calls</th>
                <th className="pb-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {eff.byTask.map((t) => (
                <tr key={t.task} className="border-t border-border/60">
                  <td className="py-2 pr-3 text-foreground">{t.task}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{t.calls}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">{formatCostUsd(t.costMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sr-only">
            <CsvExportButton filename="ai-cost-by-task" headers={["Task", "Calls", "Cost USD"]} rows={taskRows} />
          </div>
        </Labelled>
      </div>
    </Section>
  );
}

// ---- Score calibration -----------------------------------------------------

export async function CalibrationSection({ actor, filters }: { actor: Actor; filters: LineAnalyticsFilters }) {
  const bands = await getCalibration(actor, filters);
  const rows = bands.map((b) => [
    b.band,
    b.scored,
    b.replyRate === null ? "" : formatPercent(b.replyRate),
    b.meetingRate === null ? "" : formatPercent(b.meetingRate),
    b.winRate === null ? "" : formatPercent(b.winRate),
  ]);
  return (
    <Section
      title="Score calibration"
      description="Do higher-scored leads really win more? Use this to tune the profile's scoring rules."
      actions={
        <CsvExportButton filename="calibration" headers={["Band", "Scored", "Reply", "Meeting", "Win"]} rows={rows} />
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 pr-3 font-medium">Band</th>
            <th className="pb-2 pr-3 text-right font-medium">Scored</th>
            <th className="pb-2 pr-3 text-right font-medium">Reply rate</th>
            <th className="pb-2 pr-3 text-right font-medium">Meeting rate</th>
            <th className="pb-2 text-right font-medium">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.band} className="border-t border-border/60">
              <td className="py-2 pr-3 text-foreground">{b.band}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{b.scored}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">
                {b.replyRate === null ? "—" : formatPercent(b.replyRate)}
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">
                {b.meetingRate === null ? "—" : formatPercent(b.meetingRate)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-foreground">
                {b.winRate === null ? "—" : formatPercent(b.winRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-muted">
        If a lower band wins as often as a higher one, the scoring rules may be over- or under-weighting a signal.
        Adjust the weights in the line profile and re-check here next period.
      </p>
    </Section>
  );
}

// ---- helpers ---------------------------------------------------------------

/** A breakdown that degrades to an empty result rather than failing the whole section. */
async function getBreakdownSafe(
  actor: Actor,
  filters: LineAnalyticsFilters,
  dimension: BreakdownDimension,
): Promise<BreakdownResult> {
  try {
    return await getBreakdown(actor, filters, dimension);
  } catch {
    return { dimension, metricId: "reply_rate", rows: [] };
  }
}

function Labelled({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      {children}
    </div>
  );
}
