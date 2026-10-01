/**
 * Revenue and pipeline analytics data (module spec §3.14, Step 6). These services back Phase 17's
 * screens. Money is always per currency, never summed across currencies (INV-11). Durations are
 * reported as median and p75 in whole days.
 */

import "server-only";

import type { Actor, Currency, LeadStatus, Market, ServiceLine } from "@/contracts/common";
import { assertActorCan } from "@/platform/auth";

import * as repo from "./pipeline.repo";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AnalyticsFilters {
  serviceLine?: ServiceLine;
  market?: Market;
  from: Date;
  to: Date;
}

function toRepoFilters(filters: AnalyticsFilters): repo.RevenueFilters {
  return {
    from: filters.from,
    to: filters.to,
    ...(filters.serviceLine === undefined ? {} : { serviceLine: filters.serviceLine }),
    ...(filters.market === undefined ? {} : { market: filters.market }),
  };
}

async function authorize(actor: Actor, filters: AnalyticsFilters): Promise<void> {
  await assertActorCan(actor, "acquisition.analytics.read", {
    ...(filters.serviceLine === undefined ? {} : { serviceLine: filters.serviceLine }),
  });
}

function percentile(sortedMs: number[], p: number): number | null {
  if (sortedMs.length === 0) return null;
  const index = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  const value = sortedMs[index];
  return value === undefined ? null : Math.round(value / DAY_MS);
}

export interface RevenueSummary {
  byCurrency: { currency: Currency; wonCount: number; revenueMinor: number; averageDealMinor: number }[];
  wonCount: number;
  proposalAcceptanceRate: number | null;
  timeToCloseDays: { median: number | null; p75: number | null };
}

export async function getRevenueSummary(actor: Actor, filters: AnalyticsFilters): Promise<RevenueSummary> {
  await authorize(actor, filters);
  const repoFilters = toRepoFilters(filters);
  const [won, proposals, durations] = await Promise.all([
    repo.aggregateWonByCurrency(repoFilters),
    repo.countProposalsSentAndAccepted(repoFilters),
    repo.listWonCloseDurations(repoFilters),
  ]);

  const byCurrency = won.map((w) => ({
    currency: w.currency,
    wonCount: w.count,
    revenueMinor: w.totalMinor,
    averageDealMinor: w.count === 0 ? 0 : Math.round(w.totalMinor / w.count),
  }));
  const sorted = [...durations].sort((a, b) => a - b);

  return {
    byCurrency,
    wonCount: won.reduce((sum, w) => sum + w.count, 0),
    proposalAcceptanceRate: proposals.sent === 0 ? null : proposals.accepted / proposals.sent,
    timeToCloseDays: { median: percentile(sorted, 50), p75: percentile(sorted, 75) },
  };
}

export async function getLossReasons(
  actor: Actor,
  filters: AnalyticsFilters,
): Promise<{ reason: string; count: number }[]> {
  await authorize(actor, filters);
  return repo.aggregateLossReasons(toRepoFilters(filters));
}

export interface MeetingStats {
  booked: number;
  held: number;
  noShow: number;
  noShowRate: number | null;
}

export async function getMeetingStats(actor: Actor, filters: AnalyticsFilters): Promise<MeetingStats> {
  await authorize(actor, filters);
  const counts = await repo.countMeetingsByStatus(toRepoFilters(filters));
  const by = (status: string): number => counts.find((c) => c.status === status)?.count ?? 0;
  const held = by("HELD");
  const noShow = by("NO_SHOW");
  const booked = counts.reduce((sum, c) => (c.status === "UNMATCHED" ? sum : sum + c.count), 0);
  const attended = held + noShow;
  return { booked, held, noShow, noShowRate: attended === 0 ? null : noShow / attended };
}

export interface StageConversion {
  from: LeadStatus;
  to: LeadStatus;
  count: number;
}

export async function getStageConversion(actor: Actor, filters: AnalyticsFilters): Promise<StageConversion[]> {
  await authorize(actor, filters);
  const changes = await repo.listStatusChanges(toRepoFilters(filters));
  const tally = new Map<string, StageConversion>();
  for (const change of changes) {
    if (change.fromStatus === null || change.toStatus === null) continue;
    const key = `${change.fromStatus}->${change.toStatus}`;
    const existing = tally.get(key);
    if (existing === undefined) {
      tally.set(key, { from: change.fromStatus, to: change.toStatus, count: 1 });
    } else {
      existing.count += 1;
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count);
}
