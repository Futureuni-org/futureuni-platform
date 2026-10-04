/**
 * The single metric registry for Client Acquisition analytics (module spec §3.14, Phase 17 Step 1).
 *
 * Every metric shown anywhere in the analytics or overview screens is defined here exactly once:
 * its plain-language definition (shown in the UI info-tooltip), its formula, the numerator and
 * denominator it is built from, its unit, whether a higher value is better, its data source, and
 * whether it is a period or a cohort measure. Definitions must stay unambiguous and consistent
 * everywhere, so no other file restates them.
 *
 * - **Period** metrics count events that happened inside the date range (time series default).
 * - **Cohort** metrics follow the leads created inside the range through the funnel (funnel default).
 *
 * Money metrics are always per currency and never summed across currencies (INV-11). Cost metrics
 * are internal micro-USD accounting (ADR-027), never shown as client money.
 */

/** How a metric's value is read, so the UI can format and the registry can be checked. */
export type MetricUnit = "count" | "percent" | "duration" | "money" | "cost";

/** Whether a metric counts events in the range (period) or follows a created-in-range cohort. */
export type MetricBasis = "period" | "cohort";

/** Where the number comes from, for the "how this is measured" note and for traceability. */
export type MetricSource =
  | "LeadEvent"
  | "Lead"
  | "Reply"
  | "Message"
  | "Meeting"
  | "Proposal"
  | "Deal"
  | "AiCall"
  | "SearchRun"
  | "ScoreReview"
  | "Mailbox";

export interface MetricDefinition {
  /** Stable id used in URLs, AI insight citations and chart data keys. */
  readonly id: string;
  /** Short human label for headings and legends (sentence case). */
  readonly label: string;
  /** Plain-language definition, shown verbatim in the UI info-tooltip. */
  readonly definition: string;
  /** The ratio or aggregate, in words (numerator ÷ denominator, or the aggregate). */
  readonly formula: string;
  /** What is counted on top (empty for a plain aggregate like a median). */
  readonly numerator: string;
  /** What it is divided by (empty for counts and aggregates). */
  readonly denominator: string;
  readonly unit: MetricUnit;
  /** True when up is good; false when down is good (bounce, cost, time-to-close); null when neutral. */
  readonly higherIsBetter: boolean | null;
  readonly source: MetricSource;
  readonly basis: MetricBasis;
}

/**
 * The registry. The key is the metric id. Every metric id in module spec §3.14 appears here, in
 * the order the spec lists them, so the "every metric exists" check (M17-AC1) is a simple keys test.
 */
export const METRICS = {
  leads_found: {
    id: "leads_found",
    label: "Leads found",
    definition: "Leads created in the period (the NEW lead event), broken down by source.",
    formula: "count of NEW lead events in the range",
    numerator: "leads created",
    denominator: "",
    unit: "count",
    higherIsBetter: true,
    source: "LeadEvent",
    basis: "period",
  },
  enrichment_rate: {
    id: "enrichment_rate",
    label: "Enrichment rate",
    definition: "The share of created leads that reached the ENRICHED stage.",
    formula: "leads reaching ENRICHED ÷ leads created",
    numerator: "leads reaching ENRICHED",
    denominator: "leads created",
    unit: "percent",
    higherIsBetter: true,
    source: "LeadEvent",
    basis: "cohort",
  },
  audit_rate: {
    id: "audit_rate",
    label: "Audit rate",
    definition: "The share of enriched leads that reached the AUDITED stage.",
    formula: "leads reaching AUDITED ÷ leads reaching ENRICHED",
    numerator: "leads reaching AUDITED",
    denominator: "leads reaching ENRICHED",
    unit: "percent",
    higherIsBetter: true,
    source: "LeadEvent",
    basis: "cohort",
  },
  qualification_rate: {
    id: "qualification_rate",
    label: "Qualification rate",
    definition: "The share of audited leads that reached the SCORED stage.",
    formula: "leads reaching SCORED ÷ leads reaching AUDITED",
    numerator: "leads reaching SCORED",
    denominator: "leads reaching AUDITED",
    unit: "percent",
    higherIsBetter: true,
    source: "LeadEvent",
    basis: "cohort",
  },
  avg_score: {
    id: "avg_score",
    label: "Average score",
    definition: "The mean score of leads scored in the period.",
    formula: "mean score of scored leads",
    numerator: "sum of scores",
    denominator: "scored leads",
    unit: "count",
    higherIsBetter: true,
    source: "Lead",
    basis: "period",
  },
  approval_rate: {
    id: "approval_rate",
    label: "Approval rate",
    definition: "The share of reviewed first-touch drafts that were approved.",
    formula: "approved first-touch drafts ÷ first-touch drafts reviewed",
    numerator: "approved first-touch drafts",
    denominator: "first-touch drafts reviewed",
    unit: "percent",
    higherIsBetter: true,
    source: "Message",
    basis: "period",
  },
  sent: {
    id: "sent",
    label: "Sent",
    definition: "First touches sent: emails sent plus assisted sends confirmed by a person.",
    formula: "count of first-touch sends in the range",
    numerator: "first touches sent",
    denominator: "",
    unit: "count",
    higherIsBetter: true,
    source: "Message",
    basis: "period",
  },
  reply_rate: {
    id: "reply_rate",
    label: "Reply rate",
    definition:
      "The share of contacted leads that sent any genuine reply. Out-of-office and bounce auto-replies do not count.",
    formula: "leads with a non-auto reply ÷ leads contacted",
    numerator: "leads with a non-auto reply",
    denominator: "leads contacted",
    unit: "percent",
    higherIsBetter: true,
    source: "Reply",
    basis: "cohort",
  },
  positive_reply_rate: {
    id: "positive_reply_rate",
    label: "Positive-reply rate",
    definition: "The share of contacted leads whose reply was interested or a question.",
    formula: "leads with an INTERESTED or QUESTION reply ÷ leads contacted",
    numerator: "leads with a positive reply",
    denominator: "leads contacted",
    unit: "percent",
    higherIsBetter: true,
    source: "Reply",
    basis: "cohort",
  },
  unsubscribe_rate: {
    id: "unsubscribe_rate",
    label: "Unsubscribe rate",
    definition: "The share of contacted leads that unsubscribed.",
    formula: "leads that unsubscribed ÷ leads contacted",
    numerator: "leads that unsubscribed",
    denominator: "leads contacted",
    unit: "percent",
    higherIsBetter: false,
    source: "Reply",
    basis: "cohort",
  },
  bounce_rate: {
    id: "bounce_rate",
    label: "Bounce rate",
    definition: "The share of contacted leads whose address hard-bounced.",
    formula: "leads with a hard bounce ÷ leads contacted",
    numerator: "leads with a hard bounce",
    denominator: "leads contacted",
    unit: "percent",
    higherIsBetter: false,
    source: "Reply",
    basis: "cohort",
  },
  meetings_booked: {
    id: "meetings_booked",
    label: "Meetings booked",
    definition: "Meetings booked in the period.",
    formula: "count of meetings booked in the range",
    numerator: "meetings booked",
    denominator: "",
    unit: "count",
    higherIsBetter: true,
    source: "Meeting",
    basis: "period",
  },
  meeting_rate: {
    id: "meeting_rate",
    label: "Meeting rate",
    definition: "Meetings booked as a share of positive replies.",
    formula: "meetings booked ÷ positive replies",
    numerator: "meetings booked",
    denominator: "positive replies",
    unit: "percent",
    higherIsBetter: true,
    source: "Meeting",
    basis: "cohort",
  },
  no_show_rate: {
    id: "no_show_rate",
    label: "No-show rate",
    definition: "Meetings marked no-show as a share of meetings that were held or missed.",
    formula: "no-shows ÷ (held + no-show)",
    numerator: "no-shows",
    denominator: "meetings held or missed",
    unit: "percent",
    higherIsBetter: false,
    source: "Meeting",
    basis: "period",
  },
  proposals_sent: {
    id: "proposals_sent",
    label: "Proposals sent",
    definition: "Proposals sent in the period.",
    formula: "count of proposals sent in the range",
    numerator: "proposals sent",
    denominator: "",
    unit: "count",
    higherIsBetter: true,
    source: "Proposal",
    basis: "period",
  },
  proposal_acceptance_rate: {
    id: "proposal_acceptance_rate",
    label: "Proposal acceptance rate",
    definition: "Proposals accepted as a share of proposals sent.",
    formula: "proposals accepted ÷ proposals sent",
    numerator: "proposals accepted",
    denominator: "proposals sent",
    unit: "percent",
    higherIsBetter: true,
    source: "Proposal",
    basis: "period",
  },
  won: {
    id: "won",
    label: "Won",
    definition: "Deals won in the period.",
    formula: "count of deals won in the range",
    numerator: "deals won",
    denominator: "",
    unit: "count",
    higherIsBetter: true,
    source: "Deal",
    basis: "period",
  },
  win_rate: {
    id: "win_rate",
    label: "Win rate",
    definition:
      "Deals won as a share of leads contacted, and separately as a share of proposals sent. The screen labels which base a chart uses.",
    formula: "deals won ÷ leads contacted (and deals won ÷ proposals sent)",
    numerator: "deals won",
    denominator: "leads contacted",
    unit: "percent",
    higherIsBetter: true,
    source: "Deal",
    basis: "cohort",
  },
  revenue: {
    id: "revenue",
    label: "Revenue",
    definition: "The total value of won deals, shown per currency and never summed across currencies.",
    formula: "sum of won deal values, per currency",
    numerator: "won deal value",
    denominator: "",
    unit: "money",
    higherIsBetter: true,
    source: "Deal",
    basis: "period",
  },
  avg_deal_size: {
    id: "avg_deal_size",
    label: "Average deal size",
    definition: "The mean value of a won deal, per currency.",
    formula: "won revenue ÷ deals won, per currency",
    numerator: "won revenue",
    denominator: "deals won",
    unit: "money",
    higherIsBetter: true,
    source: "Deal",
    basis: "period",
  },
  time_to_first_reply: {
    id: "time_to_first_reply",
    label: "Time to first reply",
    definition: "Time from first contact to the first reply (median and 75th percentile).",
    formula: "median and p75 of (first reply − first contact)",
    numerator: "",
    denominator: "",
    unit: "duration",
    higherIsBetter: false,
    source: "Reply",
    basis: "cohort",
  },
  time_to_close: {
    id: "time_to_close",
    label: "Time to close",
    definition: "Time from first contact to a won deal (median and 75th percentile).",
    formula: "median and p75 of (won − first contact)",
    numerator: "",
    denominator: "",
    unit: "duration",
    higherIsBetter: false,
    source: "Deal",
    basis: "period",
  },
  sla_met_rate: {
    id: "sla_met_rate",
    label: "SLA met rate",
    definition:
      "The share of actionable replies answered within the response SLA (4 business hours in the owner's working time).",
    formula: "replies meeting the SLA ÷ actionable replies",
    numerator: "replies meeting the SLA",
    denominator: "actionable replies",
    unit: "percent",
    higherIsBetter: true,
    source: "Reply",
    basis: "period",
  },
  median_first_response_time: {
    id: "median_first_response_time",
    label: "Median first response time",
    definition: "The median time to the first human response on an actionable reply.",
    formula: "median of (first response − reply received)",
    numerator: "",
    denominator: "",
    unit: "duration",
    higherIsBetter: false,
    source: "Reply",
    basis: "period",
  },
  cost_per_lead: {
    id: "cost_per_lead",
    label: "Cost per lead",
    definition: "Source cost plus AI cost per lead, in US dollars (internal accounting, not client money).",
    formula: "(source cost + AI cost) ÷ leads created",
    numerator: "source cost + AI cost",
    denominator: "leads created",
    unit: "cost",
    higherIsBetter: false,
    source: "AiCall",
    basis: "period",
  },
  ai_cost_per_won_deal: {
    id: "ai_cost_per_won_deal",
    label: "AI cost per won deal",
    definition: "The AI cost of won leads divided by deals won, in US dollars.",
    formula: "AI cost of won leads ÷ deals won",
    numerator: "AI cost of won leads",
    denominator: "deals won",
    unit: "cost",
    higherIsBetter: false,
    source: "AiCall",
    basis: "period",
  },
  stage_conversion: {
    id: "stage_conversion",
    label: "Stage conversion",
    definition: "The share of leads that moved from one stage to the next.",
    formula: "moves into the next stage ÷ leads in the stage",
    numerator: "moves to the next stage",
    denominator: "leads in the stage",
    unit: "percent",
    higherIsBetter: true,
    source: "LeadEvent",
    basis: "period",
  },
  time_in_stage: {
    id: "time_in_stage",
    label: "Time in stage",
    definition: "The median time a lead spends in a stage before moving on.",
    formula: "median of (next status change − entered stage)",
    numerator: "",
    denominator: "",
    unit: "duration",
    higherIsBetter: false,
    source: "LeadEvent",
    basis: "period",
  },
} as const satisfies Record<string, MetricDefinition>;

/** Every metric id in the registry. */
export type MetricId = keyof typeof METRICS;

/** All metric ids, for iteration and the registry-complete test. */
export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

/** Look a metric up by id (used by the UI info-tooltips and the AI insight citations). */
export function getMetric(id: MetricId): MetricDefinition {
  return METRICS[id];
}

/** A type guard for ids arriving from the URL, AI output or tests. */
export function isMetricId(value: string): value is MetricId {
  return value in METRICS;
}
