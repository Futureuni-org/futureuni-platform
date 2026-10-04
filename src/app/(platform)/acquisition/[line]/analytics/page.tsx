/**
 * Line analytics page (Phase 17; R-A13, US-38). An editorial report for one service line: headline
 * stats, the cohort funnel, trends, what converts, markets, responsiveness, revenue, efficiency and
 * score calibration. Server-first: it authorises, reads through the analytics services, and streams
 * the heavy sections behind Suspense (B3.7). Filters live in the URL (B3.8).
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import type { Market } from "@/contracts/common";
import { PageHeader, PermissionState, SkeletonRows } from "@/components/patterns";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { getLineAnalytics, getBreakdown, resolveRange, type LineAnalyticsFilters, type RangePreset } from "@/modules/acquisition/analytics";
import { AnalyticsFilterBar, resolveLine } from "@/modules/acquisition/ui/analytics";

import {
  CalibrationSection,
  EfficiencySection,
  FunnelSection,
  HeadlineRow,
  MarketsSection,
  ResponsivenessSection,
  RevenueSection,
  TrendsSection,
  WhatConvertsSection,
} from "./_sections";

export const metadata: Metadata = { title: "Analytics · Acquisition" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const RANGE_PRESETS = new Set<RangePreset>(["7d", "30d", "90d", "qtd", "ytd", "custom"]);

function parseFilters(
  sp: SearchParams,
  serviceLine: LineAnalyticsFilters["serviceLine"],
  now: Date,
): LineAnalyticsFilters {
  const rawRange = one(sp.range);
  const preset: RangePreset = rawRange !== undefined && RANGE_PRESETS.has(rawRange as RangePreset) ? (rawRange as RangePreset) : "30d";
  const fromParam = one(sp.from);
  const toParam = one(sp.to);
  const range = resolveRange(
    {
      preset,
      ...(fromParam === undefined ? {} : { from: new Date(`${fromParam}T00:00:00.000Z`) }),
      ...(toParam === undefined ? {} : { to: new Date(`${toParam}T23:59:59.999Z`) }),
    },
    now,
  );
  const marketParam = one(sp.market);
  const market: Market | undefined = marketParam === "NIGERIA" || marketParam === "INTERNATIONAL" ? marketParam : undefined;
  const source = one(sp.source);
  const owner = one(sp.owner);
  return {
    serviceLine,
    ...(market === undefined ? {} : { market }),
    from: range.from,
    to: range.to,
    compare: one(sp.compare) === "previous_period",
    ...(source === undefined || source === "" ? {} : { sources: [source] }),
    ...(owner === undefined || owner === "" ? {} : { ownerId: owner }),
  };
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <SkeletonRows rows={4} />
    </div>
  );
}

export default async function LineAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ line: slug }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  if (!canFromUser(user, "acquisition.analytics.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState description={`You don't have access to ${ctx.label} analytics. Ask a manager if you need it.`} />
    );
  }

  const actor = actorOf(user);
  const filters = parseFilters(sp, ctx.line, new Date());

  const [data, sourceBreakdown, ownerBreakdown] = await Promise.all([
    getLineAnalytics(actor, filters),
    getBreakdown(actor, filters, "source"),
    getBreakdown(actor, filters, "owner"),
  ]);

  const sources = sourceBreakdown.rows.map((r) => ({ value: r.key, label: r.label }));
  const owners = ownerBreakdown.rows
    .filter((r) => r.key !== "(unassigned)")
    .map((r) => ({ value: r.key, label: r.label }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Analytics"
        title={`${ctx.label} analytics`}
        description="What's working for this line: where leads come from, what converts, how fast the team responds, and what it costs."
      />
      <AnalyticsFilterBar sources={sources} owners={owners} />
      <HeadlineRow line={ctx.line} data={data} />

      <Suspense fallback={<SectionSkeleton />}>
        <FunnelSection actor={actor} filters={filters} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <TrendsSection actor={actor} filters={filters} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <WhatConvertsSection actor={actor} filters={filters} line={ctx.line} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <MarketsSection actor={actor} filters={filters} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <ResponsivenessSection actor={actor} filters={filters} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <RevenueSection actor={actor} filters={filters} data={data} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <EfficiencySection actor={actor} filters={filters} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <CalibrationSection actor={actor} filters={filters} />
      </Suspense>
    </div>
  );
}
