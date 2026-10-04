import { describe, expect, it } from "vitest";

import {
  buildRevenueRows,
  delta,
  funnelStages,
  humanizeKey,
  isLowSample,
  LOW_SAMPLE_THRESHOLD,
  ratio,
  scalarValues,
  type LineRaw,
} from "./compute";

/** Narrows an array/find result to defined, failing the test if it isn't (avoids `!`). */
function def<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a defined value");
  return value;
}

/** A hand-built window: every expected metric below is calculated by hand from these counts. */
const RAW: LineRaw = {
  found: 100,
  enriched: 80,
  audited: 60,
  scored: 50,
  contacted: 40,
  replied: 10,
  positive: 6,
  unsubscribed: 2,
  bounced: 4,
  sent: 40,
  reviewed: 30,
  approved: 24,
  avgScore: 72,
  proposalsSent: 8,
  proposalsAccepted: 3,
  slaActionable: 20,
  slaMet: 15,
  sourceCostMicros: 1_000_000,
  aiCostMicros: 3_000_000,
  auditCostMicros: 1_000_000,
  aiCostOfWonMicros: 2_000_000,
};

const REUSED = { wonCount: 5, meetingsBooked: 4, noShowRate: 0.25 };

describe("ratio", () => {
  it("divides, and returns null for a zero denominator", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(3, 0)).toBeNull();
  });
});

describe("delta", () => {
  it("is the signed relative change, null when there is no usable comparison", () => {
    expect(delta(0.25, 0.2)).toBeCloseTo(0.25, 10);
    expect(delta(5, 10)).toBe(-0.5);
    expect(delta(5, 0)).toBeNull();
    expect(delta(null, 10)).toBeNull();
    expect(delta(5, null)).toBeNull();
  });
});

describe("scalarValues", () => {
  const v = scalarValues(RAW, REUSED);

  it("counts are passed through", () => {
    expect(v.leads_found).toBe(100);
    expect(v.sent).toBe(40);
    expect(v.meetings_booked).toBe(4);
    expect(v.won).toBe(5);
    expect(v.proposals_sent).toBe(8);
    expect(v.avg_score).toBe(72);
  });

  it("funnel rates are numerator ÷ denominator", () => {
    expect(v.enrichment_rate).toBeCloseTo(0.8, 10); // 80/100
    expect(v.audit_rate).toBeCloseTo(0.75, 10); // 60/80
    expect(v.qualification_rate).toBeCloseTo(50 / 60, 10);
    expect(v.approval_rate).toBeCloseTo(0.8, 10); // 24/30
  });

  it("reply and outcome rates are per leads contacted", () => {
    expect(v.reply_rate).toBeCloseTo(0.25, 10); // 10/40
    expect(v.positive_reply_rate).toBeCloseTo(0.15, 10); // 6/40
    expect(v.unsubscribe_rate).toBeCloseTo(0.05, 10); // 2/40
    expect(v.bounce_rate).toBeCloseTo(0.1, 10); // 4/40
    expect(v.win_rate).toBeCloseTo(0.125, 10); // 5/40
    expect(v.meeting_rate).toBeCloseTo(4 / 6, 10); // meetings ÷ positive
    expect(v.proposal_acceptance_rate).toBeCloseTo(0.375, 10); // 3/8
    expect(v.sla_met_rate).toBeCloseTo(0.75, 10); // 15/20
    expect(v.no_show_rate).toBe(0.25);
  });

  it("cost metrics are in micro-USD", () => {
    expect(v.cost_per_lead).toBe(50_000); // (1e6+3e6+1e6)/100
    expect(v.ai_cost_per_won_deal).toBe(400_000); // 2e6/5
  });

  it("returns null rather than dividing by zero", () => {
    const empty = scalarValues(
      { ...RAW, found: 0, contacted: 0, proposalsSent: 0 },
      { wonCount: 0, meetingsBooked: 0, noShowRate: null },
    );
    expect(empty.enrichment_rate).toBeNull();
    expect(empty.reply_rate).toBeNull();
    expect(empty.proposal_acceptance_rate).toBeNull();
    expect(empty.ai_cost_per_won_deal).toBeNull();
  });
});

describe("funnelStages", () => {
  const stages = funnelStages({
    found: 100,
    byStage: { enriched: 80, audited: 60, scored: 50, approved: 40, sent: 36, replied: 10, meeting: 4, proposal: 3, won: 2 },
    positive: 6,
  });

  it("lists all eleven stages in order", () => {
    expect(stages.map((s) => s.key)).toEqual([
      "found", "enriched", "audited", "scored", "approved", "sent", "replied", "positive", "meeting", "proposal", "won",
    ]);
  });

  it("computes conversion and drop-off from the previous stage", () => {
    const enriched = def(stages[1]);
    expect(enriched.count).toBe(80);
    expect(enriched.conversionFromPrevious).toBeCloseTo(0.8, 10);
    expect(enriched.dropOff).toBe(20);
    expect(def(stages[0]).conversionFromPrevious).toBeNull(); // found has no previous
    const positive = def(stages.find((s) => s.key === "positive"));
    expect(positive.count).toBe(6);
    expect(positive.conversionFromPrevious).toBeCloseTo(6 / 10, 10); // positive ÷ replied
  });
});

describe("buildRevenueRows", () => {
  it("keeps currencies separate and never sums them", () => {
    const rows = buildRevenueRows(
      [
        { currency: "NGN", wonCount: 2, revenueMinor: 500_000, averageDealMinor: 250_000 },
        { currency: "USD", wonCount: 1, revenueMinor: 120_000, averageDealMinor: 120_000 },
      ],
      [{ currency: "NGN", revenueMinor: 400_000 }],
    );
    const ngn = def(rows.find((r) => r.currency === "NGN"));
    const usd = def(rows.find((r) => r.currency === "USD"));
    expect(ngn.revenueMinor).toBe(500_000);
    expect(ngn.deltaRevenue).toBeCloseTo(0.25, 10); // (500k-400k)/400k
    expect(usd.previousRevenueMinor).toBe(0);
    expect(usd.deltaRevenue).toBeNull(); // previous zero
    expect(rows).toHaveLength(2);
  });

  it("has no delta when there is no comparison window", () => {
    const rows = buildRevenueRows([{ currency: "GBP", wonCount: 1, revenueMinor: 100, averageDealMinor: 100 }], null);
    expect(def(rows[0]).deltaRevenue).toBeNull();
  });
});

describe("low sample and labels", () => {
  it("flags samples below the threshold", () => {
    expect(isLowSample(LOW_SAMPLE_THRESHOLD - 1)).toBe(true);
    expect(isLowSample(LOW_SAMPLE_THRESHOLD)).toBe(false);
  });

  it("humanises market and channel keys", () => {
    expect(humanizeKey("market", "NIGERIA")).toBe("Nigeria");
    expect(humanizeKey("market", "INTERNATIONAL")).toBe("International");
    expect(humanizeKey("channel", "WHATSAPP_ASSISTED")).toBe("Whatsapp Assisted");
    expect(humanizeKey("signal", "no_website")).toBe("no_website");
  });
});
