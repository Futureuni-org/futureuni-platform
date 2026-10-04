import { describe, expect, it } from "vitest";

import { getMetric, isMetricId, METRIC_IDS, METRICS } from "./metrics";

/** Every metric id listed in module spec §3.14 — the registry must define exactly these (M17-AC1). */
const SPEC_METRIC_IDS = [
  "leads_found",
  "enrichment_rate",
  "audit_rate",
  "qualification_rate",
  "avg_score",
  "approval_rate",
  "sent",
  "reply_rate",
  "positive_reply_rate",
  "unsubscribe_rate",
  "bounce_rate",
  "meetings_booked",
  "meeting_rate",
  "no_show_rate",
  "proposals_sent",
  "proposal_acceptance_rate",
  "won",
  "win_rate",
  "revenue",
  "avg_deal_size",
  "time_to_first_reply",
  "time_to_close",
  "sla_met_rate",
  "median_first_response_time",
  "cost_per_lead",
  "ai_cost_per_won_deal",
  "stage_conversion",
  "time_in_stage",
] as const;

describe("metric registry", () => {
  it("defines every §3.14 metric and no extras (M17-AC1)", () => {
    expect([...METRIC_IDS].sort()).toEqual([...SPEC_METRIC_IDS].sort());
  });

  it("every entry's id matches its key and has a non-empty definition", () => {
    for (const id of METRIC_IDS) {
      const metric = METRICS[id];
      expect(metric.id).toBe(id);
      expect(metric.definition.length).toBeGreaterThan(0);
      expect(metric.label.length).toBeGreaterThan(0);
    }
  });

  it("money and cost metrics are typed accordingly", () => {
    expect(getMetric("revenue").unit).toBe("money");
    expect(getMetric("avg_deal_size").unit).toBe("money");
    expect(getMetric("cost_per_lead").unit).toBe("cost");
    expect(getMetric("ai_cost_per_won_deal").unit).toBe("cost");
  });

  it("direction is set for rates where lower is better", () => {
    expect(getMetric("bounce_rate").higherIsBetter).toBe(false);
    expect(getMetric("unsubscribe_rate").higherIsBetter).toBe(false);
    expect(getMetric("no_show_rate").higherIsBetter).toBe(false);
    expect(getMetric("time_to_close").higherIsBetter).toBe(false);
    expect(getMetric("reply_rate").higherIsBetter).toBe(true);
  });

  it("the funnel defaults to cohort and the trends to period", () => {
    expect(getMetric("reply_rate").basis).toBe("cohort");
    expect(getMetric("leads_found").basis).toBe("period");
  });

  it("isMetricId guards unknown ids", () => {
    expect(isMetricId("reply_rate")).toBe(true);
    expect(isMetricId("not_a_metric")).toBe(false);
  });
});
