/**
 * Pure metric assembly for analytics (Phase 17). These functions turn raw counts into metric
 * values, rates, deltas, funnel stages and per-currency revenue rows, with no I/O, so every value
 * can be checked by hand in a unit test. The service layer does the database reads and calls these.
 */

import type { Currency } from "@/contracts/common";

import type { MetricId } from "./metrics";
import type { FunnelStage, RevenueByCurrencyRow } from "./types";

/** Below this sample size a breakdown row is muted and labelled "low sample" (module spec §3.14). */
export const LOW_SAMPLE_THRESHOLD = 20;

export function isLowSample(sampleSize: number): boolean {
  return sampleSize < LOW_SAMPLE_THRESHOLD;
}

/** A ratio, or null when the denominator is zero (so a rate is never a divide-by-zero). */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Signed relative change `(value − previous) ÷ previous`, null when there's no usable comparison. */
export function delta(value: number | null, previous: number | null): number | null {
  if (value === null || previous === null || previous === 0) return null;
  return (value - previous) / previous;
}

/** Raw counts for one line and window, as read from the repos. */
export interface LineRaw {
  found: number;
  enriched: number;
  audited: number;
  scored: number;
  contacted: number;
  replied: number;
  positive: number;
  unsubscribed: number;
  bounced: number;
  sent: number;
  reviewed: number;
  approved: number;
  avgScore: number | null;
  proposalsSent: number;
  proposalsAccepted: number;
  slaActionable: number;
  slaMet: number;
  sourceCostMicros: number;
  aiCostMicros: number;
  auditCostMicros: number;
  aiCostOfWonMicros: number;
}

/** Values the reused pipeline services provide for the same window. */
export interface ReusedWindow {
  wonCount: number;
  meetingsBooked: number;
  noShowRate: number | null;
}

/** Every single-valued metric for a window, keyed by metric id (durations are handled elsewhere). */
export function scalarValues(
  raw: LineRaw,
  reused: ReusedWindow,
): Partial<Record<MetricId, number | null>> {
  return {
    leads_found: raw.found,
    enrichment_rate: ratio(raw.enriched, raw.found),
    audit_rate: ratio(raw.audited, raw.enriched),
    qualification_rate: ratio(raw.scored, raw.audited),
    avg_score: raw.avgScore,
    approval_rate: ratio(raw.approved, raw.reviewed),
    sent: raw.sent,
    reply_rate: ratio(raw.replied, raw.contacted),
    positive_reply_rate: ratio(raw.positive, raw.contacted),
    unsubscribe_rate: ratio(raw.unsubscribed, raw.contacted),
    bounce_rate: ratio(raw.bounced, raw.contacted),
    meetings_booked: reused.meetingsBooked,
    meeting_rate: ratio(reused.meetingsBooked, raw.positive),
    no_show_rate: reused.noShowRate,
    proposals_sent: raw.proposalsSent,
    proposal_acceptance_rate: ratio(raw.proposalsAccepted, raw.proposalsSent),
    won: reused.wonCount,
    win_rate: ratio(reused.wonCount, raw.contacted),
    sla_met_rate: ratio(raw.slaMet, raw.slaActionable),
    cost_per_lead: ratio(raw.sourceCostMicros + raw.aiCostMicros + raw.auditCostMicros, raw.found),
    ai_cost_per_won_deal: ratio(raw.aiCostOfWonMicros, reused.wonCount),
  };
}

/** The cohort funnel order. `found` and `positive` are not lead statuses; the rest are stage keys. */
export const FUNNEL_SEQUENCE: { key: string; label: string }[] = [
  { key: "found", label: "Found" },
  { key: "enriched", label: "Enriched" },
  { key: "audited", label: "Audited" },
  { key: "scored", label: "Scored" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "positive", label: "Positive" },
  { key: "meeting", label: "Meeting" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
];

export interface StageCounts {
  found: number;
  byStage: Record<string, number>;
  positive: number;
}

/** Builds the ordered funnel stages with conversion and drop-off from the previous stage. */
export function funnelStages(counts: StageCounts): FunnelStage[] {
  const value = (key: string): number => {
    if (key === "found") return counts.found;
    if (key === "positive") return counts.positive;
    return counts.byStage[key] ?? 0;
  };
  return FUNNEL_SEQUENCE.map((stage, index) => {
    const count = value(stage.key);
    const previous = index === 0 ? null : value(FUNNEL_SEQUENCE[index - 1]?.key ?? "");
    return {
      key: stage.key,
      label: stage.label,
      count,
      conversionFromPrevious: previous === null ? null : ratio(count, previous),
      dropOff: previous === null ? null : previous - count,
    };
  });
}

/** Per-currency revenue rows with the previous-period comparison (never summed across currencies). */
export function buildRevenueRows(
  current: {
    currency: Currency;
    wonCount: number;
    revenueMinor: number;
    averageDealMinor: number;
  }[],
  previous: { currency: Currency; revenueMinor: number }[] | null,
): RevenueByCurrencyRow[] {
  const prevByCurrency = new Map((previous ?? []).map((p) => [p.currency, p.revenueMinor]));
  return current.map((c) => {
    const previousRevenueMinor = prevByCurrency.get(c.currency) ?? 0;
    return {
      currency: c.currency,
      revenueMinor: c.revenueMinor,
      wonCount: c.wonCount,
      averageDealMinor: c.averageDealMinor,
      previousRevenueMinor,
      deltaRevenue: delta(c.revenueMinor, previous === null ? null : previousRevenueMinor),
    };
  });
}

/** Turns a raw breakdown key into a readable label for market and channel dimensions. */
export function humanizeKey(dimension: string, key: string): string {
  if (dimension === "market") return key === "NIGERIA" ? "Nigeria" : "International";
  if (dimension === "channel") {
    return key
      .toLowerCase()
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return key;
}
